"""Service for managing workspaces, members, and invitations."""
from datetime import datetime, timedelta
from typing import Optional, List
from sqlmodel import Session, select
from fastapi import HTTPException, status
import secrets
import hashlib
import os

from app.models import (
    Workspace,
    WorkspaceMember,
    WorkspaceInvitation,
    User,
    Plan,
    Chatbot,
)


class WorkspaceService:
    """Service to manage workspaces and their members."""
    
    @staticmethod
    def create_workspace(
        name: str,
        owner: User,
        description: Optional[str] = None,
        session: Session = None
    ) -> Workspace:
        """Create a new workspace for a user.
        
        Credits come from owner's plan, not stored in workspace.
        All workspaces owned by the same user share the owner's credit pool.
        
        Users without plans (invited users) cannot create workspaces.
        """
        # Users without plans cannot create workspaces
        if not owner.plan_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You need a subscription plan to create workspaces. Please upgrade your account to create and manage your own workspaces."
            )
        
        workspace = Workspace(
            name=name,
            description=description,
            owner_uuid=owner.uuid
        )
        session.add(workspace)
        session.commit()
        session.refresh(workspace)
        
        # Add owner as workspace member with 'owner' role
        member = WorkspaceMember(
            workspace_uuid=workspace.uuid,
            user_uuid=owner.uuid,
            role="owner"
        )
        session.add(member)
        session.commit()
        
        return workspace
    
    @staticmethod
    def get_user_workspaces(user: User, session: Session) -> List[Workspace]:
        """Get all workspaces a user is a member of."""
        # Get workspaces where user is owner or member
        workspaces = session.exec(
            select(Workspace)
            .join(WorkspaceMember)
            .where(WorkspaceMember.user_uuid == user.uuid)
        ).all()
        
        return list(workspaces)
    
    @staticmethod
    def get_workspace(workspace_uuid: str, user: User, session: Session) -> Workspace:
        """Get a workspace if user is a member."""
        workspace = session.get(Workspace, workspace_uuid)
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        
        # Check if user is a member
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_uuid == workspace_uuid,
                WorkspaceMember.user_uuid == user.uuid
            )
        ).first()
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this workspace"
            )
        
        return workspace
    
    @staticmethod
    def check_workspace_access(workspace_uuid: str, user: User, session: Session) -> Workspace:
        """Check if user has access to workspace and return it."""
        return WorkspaceService.get_workspace(workspace_uuid, user, session)
    
    @staticmethod
    def get_workspace_members(workspace_uuid: str, session: Session) -> List[WorkspaceMember]:
        """Get all members of a workspace."""
        members = session.exec(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_uuid == workspace_uuid)
        ).all()
        
        return list(members)
    
    @staticmethod
    def check_user_limit(workspace: Workspace, session: Session) -> bool:
        """Check if workspace can accept more members based on owner's plan."""
        owner = session.get(User, workspace.owner_uuid)
        if not owner:
            return False
        
        plan = session.get(Plan, owner.plan_id)
        if not plan:
            return False
        
        # Count current members
        member_count = session.exec(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_uuid == workspace.uuid)
        ).all()
        
        return len(member_count) < plan.max_workspace_users
    
    @staticmethod
    def create_invitation(
        workspace_uuid: str,
        email: str,
        invited_by: User,
        session: Session,
        username: Optional[str] = None
    ) -> WorkspaceInvitation:
        """Create a workspace invitation or add existing user to workspace."""
        from app.auth import hash_password
        
        # Check workspace access
        workspace = WorkspaceService.check_workspace_access(workspace_uuid, invited_by, session)
        
        # Check if user is owner or admin
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_uuid == workspace_uuid,
                WorkspaceMember.user_uuid == invited_by.uuid
            )
        ).first()
        
        if member.role not in ["owner", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace owners and admins can invite members"
            )
        
        # Check user limit
        if not WorkspaceService.check_user_limit(workspace, session):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace has reached its user limit"
            )
        
        # Check if user already exists
        existing_user = session.exec(
            select(User).where(User.email == email)
        ).first()
        
        # If user exists, just add them to workspace immediately
        if existing_user:
            existing_member = session.exec(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_uuid == workspace_uuid,
                    WorkspaceMember.user_uuid == existing_user.uuid
                )
            ).first()
            
            if existing_member:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User is already a member of this workspace"
                )
            
            # Add existing user to workspace
            new_member = WorkspaceMember(
                workspace_uuid=workspace_uuid,
                user_uuid=existing_user.uuid,
                role="member"
            )
            session.add(new_member)
            session.commit()
            session.refresh(new_member)
            
            # Create invitation record for tracking (already accepted)
            invitation = WorkspaceInvitation(
                workspace_uuid=workspace_uuid,
                email=email,
                invited_by_uuid=invited_by.uuid,
                token=secrets.token_urlsafe(32),
                status="accepted",
                accepted_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=7)
            )
            session.add(invitation)
            session.commit()
            session.refresh(invitation)
            
            return invitation
        
        # User doesn't exist - create account and send email
        # Check for pending invitation
        pending_invitation = session.exec(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.workspace_uuid == workspace_uuid,
                WorkspaceInvitation.email == email,
                WorkspaceInvitation.status == "pending"
            )
        ).first()
        
        if pending_invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation already sent to this email"
            )
        
        # Generate username if not provided, or use provided one
        if not username:
            username = f"user_{secrets.token_hex(8)}"
        else:
            # Check if username is already taken
            existing_username = session.exec(
                select(User).where(User.username == username)
            ).first()
            if existing_username:
                # If username is taken, append random suffix
                username = f"{username}_{secrets.token_hex(4)}"
        
        # Generate random password
        password = secrets.token_urlsafe(16)
        
        # Create new user
        new_user = User(
            username=username,
            email=email,
            hashed_password=hash_password(password),
            user_type="normal"
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        
        # Add user to workspace
        new_member = WorkspaceMember(
            workspace_uuid=workspace_uuid,
            user_uuid=new_user.uuid,
            role="member"
        )
        session.add(new_member)
        session.commit()
        
        # Generate unique token for invitation record
        token = secrets.token_urlsafe(32)
        
        # Create invitation record (already accepted since user is created)
        invitation = WorkspaceInvitation(
            workspace_uuid=workspace_uuid,
            email=email,
            invited_by_uuid=invited_by.uuid,
            token=token,
            status="accepted",
            accepted_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=7)
        )
        session.add(invitation)
        session.commit()
        session.refresh(invitation)
        
        # Send email with credentials using Celery queue
        inviter_name = invited_by.username
        from app.celery_app import celery_app
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            result = celery_app.send_task(
                "app.tasks.send_workspace_invitation_email",
                args=[
                    email,  # to_email
                    workspace.name,  # workspace_name
                    inviter_name,  # inviter_name
                    email,  # email
                    password,  # password
                    os.getenv("FRONTEND_URL", "http://localhost:3000/login")  # login_url
                ]
            )
            logger.info(f"Enqueued email task {result.id} for {email}")
        except Exception as e:
            logger.error(f"Failed to enqueue email task for {email}: {str(e)}", exc_info=True)
        
        return invitation
    
    @staticmethod
    def accept_invitation(
        token: str,
        user: Optional[User],
        session: Session
    ) -> WorkspaceMember:
        """Accept a workspace invitation."""
        invitation = session.exec(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.token == token,
                WorkspaceInvitation.status == "pending"
            )
        ).first()
        
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found or already used"
            )
        
        if invitation.expires_at < datetime.utcnow():
            invitation.status = "expired"
            session.add(invitation)
            session.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired"
            )
        
        # Check if user exists with this email
        if not user:
            # User doesn't exist, we need to create one
            # Generate random username and password
            username = f"user_{secrets.token_hex(8)}"
            password = secrets.token_urlsafe(16)
            
            # Hash password
            from app.services.auth_service import AuthService
            hashed_password = AuthService.hash_password(password)
            
            user = User(
                username=username,
                email=invitation.email,
                hashed_password=hashed_password,
                user_type="normal"
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            
            # TODO: Send email with credentials (username and password)
            # For now, we'll just create the user
        
        # Add user to workspace
        member = WorkspaceMember(
            workspace_uuid=invitation.workspace_uuid,
            user_uuid=user.uuid,
            role="member"
        )
        session.add(member)
        
        # Update invitation
        invitation.status = "accepted"
        invitation.accepted_at = datetime.utcnow()
        session.add(invitation)
        
        session.commit()
        session.refresh(member)
        
        return member


workspace_service = WorkspaceService()

