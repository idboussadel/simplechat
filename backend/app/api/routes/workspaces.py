"""API routes for workspace management."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from app.database import get_session
from app.models import User, Workspace, WorkspaceMember, WorkspaceInvitation, Chatbot, Conversation, Message
from app.services.workspace_service import workspace_service
from app.services.credits_service import credits_service
from app.auth import get_current_user


router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WorkspaceResponse(BaseModel):
    uuid: str
    name: str
    description: Optional[str]
    owner_uuid: str
    created_at: str
    credits_remaining: int
    credits_total: int
    
    class Config:
        from_attributes = True


class WorkspaceMemberResponse(BaseModel):
    id: int
    user_uuid: str
    username: str
    email: str
    role: str
    joined_at: str
    
    class Config:
        from_attributes = True


class InvitationCreate(BaseModel):
    email: EmailStr
    username: Optional[str] = None  # Optional username for new users


class InvitationResponse(BaseModel):
    id: int
    email: str
    status: str
    expires_at: str
    created_at: str
    
    class Config:
        from_attributes = True


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    workspace_data: WorkspaceCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Create a new workspace."""
    if current_user.user_type == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin users cannot create workspaces"
        )
    
    workspace = workspace_service.create_workspace(
        name=workspace_data.name,
        owner=current_user,
        description=workspace_data.description,
        session=session
    )
    
    # Get credits info
    credits_info = credits_service.get_workspace_credits_info(workspace.uuid, session)
    
    return {
        "uuid": workspace.uuid,
        "name": workspace.name,
        "description": workspace.description,
        "owner_uuid": workspace.owner_uuid,
        "created_at": workspace.created_at.isoformat(),
        "credits_remaining": credits_info["credits_remaining"],
        "credits_total": credits_info["credits_total"]
    }


@router.get("", response_model=List[WorkspaceResponse])
def list_workspaces(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all workspaces the current user is a member of."""
    if current_user.user_type == "admin":
        # Admins see all workspaces
        workspaces = session.exec(select(Workspace)).all()
    else:
        workspaces = workspace_service.get_user_workspaces(current_user, session)
    
    result = []
    for workspace in workspaces:
        credits_info = credits_service.get_workspace_credits_info(workspace.uuid, session)
        result.append({
            "uuid": workspace.uuid,
            "name": workspace.name,
            "description": workspace.description,
            "owner_uuid": workspace.owner_uuid,
            "created_at": workspace.created_at.isoformat(),
            "credits_remaining": credits_info["credits_remaining"],
            "credits_total": credits_info["credits_total"]
        })
    
    return result


@router.get("/{workspace_uuid}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_uuid: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get a specific workspace."""
    if current_user.user_type == "admin":
        workspace = session.get(Workspace, workspace_uuid)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
    else:
        workspace = workspace_service.get_workspace(workspace_uuid, current_user, session)
    
    credits_info = credits_service.get_workspace_credits_info(workspace.uuid, session)
    
    return {
        "uuid": workspace.uuid,
        "name": workspace.name,
        "description": workspace.description,
        "owner_uuid": workspace.owner_uuid,
        "created_at": workspace.created_at.isoformat(),
        "credits_remaining": credits_info["credits_remaining"],
        "credits_total": credits_info["credits_total"]
    }


@router.get("/{workspace_uuid}/members", response_model=List[WorkspaceMemberResponse])
def get_workspace_members(
    workspace_uuid: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all members of a workspace."""
    workspace = workspace_service.check_workspace_access(workspace_uuid, current_user, session)
    
    members = workspace_service.get_workspace_members(workspace_uuid, session)
    
    result = []
    for member in members:
        user = session.get(User, member.user_uuid)
        if user:
            result.append({
                "id": member.id,
                "user_uuid": member.user_uuid,
                "username": user.username,
                "email": user.email,
                "role": member.role,
                "joined_at": member.joined_at.isoformat()
            })
    
    return result


@router.post("/{workspace_uuid}/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def create_invitation(
    workspace_uuid: str,
    invitation_data: InvitationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Invite a user to a workspace."""
    invitation = workspace_service.create_invitation(
        workspace_uuid=workspace_uuid,
        email=invitation_data.email,
        username=invitation_data.username,
        invited_by=current_user,
        session=session
    )
    
    return {
        "id": invitation.id,
        "email": invitation.email,
        "status": invitation.status,
        "expires_at": invitation.expires_at.isoformat(),
        "created_at": invitation.created_at.isoformat()
    }


@router.post("/invitations/{token}/accept", status_code=status.HTTP_200_OK)
def accept_invitation(
    token: str,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Accept a workspace invitation."""
    # If user is not logged in, we'll create one
    member = workspace_service.accept_invitation(
        token=token,
        user=current_user,
        session=session
    )
    
    return {
        "message": "Invitation accepted successfully",
        "workspace_uuid": member.workspace_uuid,
        "user_uuid": member.user_uuid
    }


@router.get("/{workspace_uuid}/credits", status_code=status.HTTP_200_OK)
def get_workspace_credits(
    workspace_uuid: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get workspace credits information."""
    workspace = workspace_service.check_workspace_access(workspace_uuid, current_user, session)
    
    return credits_service.get_workspace_credits_info(workspace_uuid, session)


class UsageHistoryItem(BaseModel):
    date: str
    credits_used: int


class AgentCreditsItem(BaseModel):
    chatbot_uuid: str
    chatbot_name: str
    credits_used: int


class WorkspaceAnalyticsResponse(BaseModel):
    usage_history: List[UsageHistoryItem]
    credits_per_agent: List[AgentCreditsItem]
    total_credits_used: int


@router.get("/{workspace_uuid}/analytics", response_model=WorkspaceAnalyticsResponse)
def get_workspace_analytics(
    workspace_uuid: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get workspace analytics: usage history and credits per agent."""
    from datetime import datetime, timedelta
    from sqlalchemy import func, cast, Date
    
    workspace = workspace_service.check_workspace_access(workspace_uuid, current_user, session)
    
    # Get all chatbots in this workspace
    chatbots = session.exec(
        select(Chatbot).where(Chatbot.workspace_uuid == workspace_uuid)
    ).all()
    chatbot_uuids = [c.uuid for c in chatbots]
    
    if not chatbot_uuids:
        return {
            "usage_history": [],
            "credits_per_agent": [],
            "total_credits_used": 0
        }
    
    # Parse date range (default to last 30 days)
    if end_date:
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    else:
        end = datetime.utcnow()
    
    if start_date:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    else:
        start = end - timedelta(days=30)
    
    # Get all conversations for these chatbots
    conversations = session.exec(
        select(Conversation)
        .where(Conversation.chatbot_uuid.in_(chatbot_uuids))
        .where(Conversation.created_at >= start)
        .where(Conversation.created_at <= end)
    ).all()
    
    conversation_uuids = [c.uuid for c in conversations]
    
    if not conversation_uuids:
        return {
            "usage_history": [],
            "credits_per_agent": [],
            "total_credits_used": 0
        }
    
    # Get all assistant messages (each represents 1 credit used)
    messages = session.exec(
        select(Message)
        .where(Message.conversation_uuid.in_(conversation_uuids))
        .where(Message.role == "assistant")
        .where(Message.created_at >= start)
        .where(Message.created_at <= end)
    ).all()
    
    # Group by date for usage history
    usage_by_date: dict[str, int] = {}
    for msg in messages:
        date_str = msg.created_at.date().isoformat()
        usage_by_date[date_str] = usage_by_date.get(date_str, 0) + 1
    
    # Fill in missing dates with 0
    usage_history = []
    current_date = start.date()
    while current_date <= end.date():
        date_str = current_date.isoformat()
        usage_history.append({
            "date": date_str,
            "credits_used": usage_by_date.get(date_str, 0)
        })
        current_date += timedelta(days=1)
    
    # Group by chatbot for credits per agent
    credits_by_chatbot: dict[str, dict[str, any]] = {}
    for msg in messages:
        # Find which chatbot this message belongs to
        conv = next((c for c in conversations if c.uuid == msg.conversation_uuid), None)
        if conv:
            chatbot_uuid = conv.chatbot_uuid
            chatbot = next((c for c in chatbots if c.uuid == chatbot_uuid), None)
            if chatbot:
                if chatbot_uuid not in credits_by_chatbot:
                    credits_by_chatbot[chatbot_uuid] = {
                        "chatbot_uuid": chatbot_uuid,
                        "chatbot_name": chatbot.name,
                        "credits_used": 0
                    }
                credits_by_chatbot[chatbot_uuid]["credits_used"] += 1
    
    credits_per_agent = list(credits_by_chatbot.values())
    credits_per_agent.sort(key=lambda x: x["credits_used"], reverse=True)
    
    total_credits_used = len(messages)
    
    return {
        "usage_history": usage_history,
        "credits_per_agent": credits_per_agent,
        "total_credits_used": total_credits_used
    }

