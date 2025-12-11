from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models import User, Chatbot, Workspace, WorkspaceMember, Plan
from app.schemas import ChatbotCreate, ChatbotUpdate
from app.services.workspace_service import workspace_service


class ChatbotService:
    """Service layer for chatbot business logic"""
    
    @staticmethod
    def create_chatbot(chatbot_data: ChatbotCreate, user_uuid: str, session: Session, workspace_uuid: Optional[str] = None) -> Chatbot:
        """
        Create a new chatbot for a user.
        If workspace_uuid is not provided, gets or creates a workspace for the user.
        """
        user = session.get(User, user_uuid)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # If workspace_uuid not provided, get or create workspace
        if not workspace_uuid:
            # Check if user has any workspace
            workspaces = workspace_service.get_user_workspaces(user, session)
            if workspaces:
                # Use first workspace
                workspace_uuid = workspaces[0].uuid
            else:
                # Users without plans cannot create workspaces
                if not user.plan_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You need a plan to create chatbots. Please upgrade your account or join a workspace."
                    )
                
                # Create new workspace for user
                workspace = workspace_service.create_workspace(
                    name=f"{user.username}'s Workspace",
                    owner=user,
                    session=session
                )
                workspace_uuid = workspace.uuid
        
        # Verify workspace access
        workspace = workspace_service.check_workspace_access(workspace_uuid, user, session)
        
        db_chatbot = Chatbot(
            workspace_uuid=workspace_uuid,
            user_uuid=user_uuid,
            name=chatbot_data.name,
            description=chatbot_data.description,
            language=chatbot_data.language,
            tone=chatbot_data.tone,
            instructions=chatbot_data.instructions,
            model_name=chatbot_data.model_name
        )
        
        session.add(db_chatbot)
        session.commit()
        session.refresh(db_chatbot)
        
        return db_chatbot
    
    @staticmethod
    def get_chatbot_by_uuid(chatbot_uuid: str, session: Session) -> Optional[Chatbot]:
        """Get a chatbot by UUID"""
        return session.get(Chatbot, chatbot_uuid)
    
    @staticmethod
    def get_user_chatbots(user_uuid: str, session: Session, workspace_uuid: Optional[str] = None) -> List[Chatbot]:
        """Get all chatbots for a specific user, optionally filtered by workspace"""
        user = session.get(User, user_uuid)
        if not user:
            return []
        
        # Get user's workspaces
        workspaces = workspace_service.get_user_workspaces(user, session)
        if not workspaces:
            return []
        
        # Filter by workspace if provided
        if workspace_uuid:
            # Verify access
            workspace_service.check_workspace_access(workspace_uuid, user, session)
            workspace_uuids = [workspace_uuid]
        else:
            workspace_uuids = [w.uuid for w in workspaces]
        
        chatbots = session.exec(
            select(Chatbot).where(Chatbot.workspace_uuid.in_(workspace_uuids))
        ).all()
        return list(chatbots)
    
    @staticmethod
    def update_chatbot(
        chatbot_uuid: str,
        chatbot_update: ChatbotUpdate,
        user_uuid: str,
        session: Session
    ) -> Chatbot:
        """
        Update a chatbot.
        Validates ownership before updating.
        """
        chatbot = session.get(Chatbot, chatbot_uuid)
        
        if not chatbot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chatbot not found"
            )
        
        # Get user object
        user = session.get(User, user_uuid)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Verify workspace access (allows workspace members)
        try:
            workspace_service.check_workspace_access(chatbot.workspace_uuid, user, session)
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify this chatbot"
            )
        
        # Update fields
        update_data = chatbot_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(chatbot, key, value)
        
        # Update timestamp
        chatbot.updated_at = datetime.utcnow()
        
        session.add(chatbot)
        session.commit()
        session.refresh(chatbot)
        
        return chatbot
    
    @staticmethod
    def delete_chatbot(chatbot_uuid: str, user_uuid: str, session: Session) -> None:
        """
        Delete a chatbot and all its Pinecone vectors.
        Only workspace owners can delete chatbots.
        """
        chatbot = session.get(Chatbot, chatbot_uuid)
        
        if not chatbot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chatbot not found"
            )
        
        # Get workspace and verify user is the owner (only owners can delete)
        workspace = session.get(Workspace, chatbot.workspace_uuid)
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        
        if workspace.owner_uuid != user_uuid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace owners can delete chatbots"
            )
        
        # Delete all Pinecone vectors for this chatbot
        try:
            from app.services.pinecone_service import PineconeService
            pinecone_service = PineconeService()
            pinecone_service.delete_chatbot_namespace(chatbot.uuid)
        except Exception as e:
            # Log error but continue with DB deletion
            import logging
            logging.error(f"Failed to delete Pinecone namespace for chatbot {chatbot.uuid}: {str(e)}")
        
        session.delete(chatbot)
        session.commit()
    
    @staticmethod
    def verify_chatbot_ownership(chatbot_uuid: str, user_uuid: str, session: Session) -> Chatbot:
        """
        Verify that a user has access to a chatbot (via workspace membership) and return it.
        Raises HTTPException if not found or unauthorized.
        """
        chatbot = session.get(Chatbot, chatbot_uuid)
        
        if not chatbot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chatbot not found"
            )
        
        user = session.get(User, user_uuid)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check workspace access
        try:
            workspace_service.check_workspace_access(chatbot.workspace_uuid, user, session)
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this chatbot"
            )
        
        return chatbot
