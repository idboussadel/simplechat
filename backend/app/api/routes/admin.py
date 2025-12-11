"""
Admin API routes for super admin dashboard.
Only accessible to users with user_type='admin'
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.models import User, Chatbot, Workspace, Conversation, Message, Ticket
from app.auth import get_current_user
from app.database import get_session

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to ensure user is an admin"""
    if current_user.user_type != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


class AdminAnalyticsResponse(BaseModel):
    total_users: int
    total_workspaces: int
    total_chatbots: int
    total_conversations: int
    total_messages: int
    active_users_24h: int
    active_users_7d: int
    active_users_30d: int
    new_users_today: int
    new_users_7d: int
    new_users_30d: int
    users_by_type: dict
    conversations_today: int
    conversations_7d: int
    conversations_30d: int
    messages_today: int
    messages_7d: int
    messages_30d: int


@router.get("/analytics", response_model=AdminAnalyticsResponse)
def get_admin_analytics(
    session: Session = Depends(get_session),
    admin_user: User = Depends(require_admin)
):
    """Get comprehensive analytics for admin dashboard"""
    
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    day_ago = now - timedelta(days=1)
    
    # Total counts
    total_users = session.exec(select(func.count(User.uuid))).one()
    total_workspaces = session.exec(select(func.count(Workspace.uuid))).one()
    total_chatbots = session.exec(select(func.count(Chatbot.uuid))).one()
    total_conversations = session.exec(select(func.count(Conversation.uuid))).one()
    total_messages = session.exec(select(func.count(Message.id))).one()
    
    # Active users (users who have created conversations in the time period)
    active_users_24h = session.exec(
        select(func.count(func.distinct(Conversation.client_uuid)))
        .where(Conversation.created_at >= day_ago)
    ).one() or 0
    
    active_users_7d = session.exec(
        select(func.count(func.distinct(Conversation.client_uuid)))
        .where(Conversation.created_at >= week_ago)
    ).one() or 0
    
    active_users_30d = session.exec(
        select(func.count(func.distinct(Conversation.client_uuid)))
        .where(Conversation.created_at >= month_ago)
    ).one() or 0
    
    # New users
    new_users_today = session.exec(
        select(func.count(User.uuid))
        .where(User.created_at >= today_start)
    ).one() or 0
    
    new_users_7d = session.exec(
        select(func.count(User.uuid))
        .where(User.created_at >= week_ago)
    ).one() or 0
    
    new_users_30d = session.exec(
        select(func.count(User.uuid))
        .where(User.created_at >= month_ago)
    ).one() or 0
    
    # Users by type
    users_by_type = {}
    for user_type in ["admin", "normal", "customer_service"]:
        count = session.exec(
            select(func.count(User.uuid))
            .where(User.user_type == user_type)
        ).one() or 0
        users_by_type[user_type] = count
    
    # Conversations
    conversations_today = session.exec(
        select(func.count(Conversation.uuid))
        .where(Conversation.created_at >= today_start)
    ).one() or 0
    
    conversations_7d = session.exec(
        select(func.count(Conversation.uuid))
        .where(Conversation.created_at >= week_ago)
    ).one() or 0
    
    conversations_30d = session.exec(
        select(func.count(Conversation.uuid))
        .where(Conversation.created_at >= month_ago)
    ).one() or 0
    
    # Messages
    messages_today = session.exec(
        select(func.count(Message.id))
        .where(Message.created_at >= today_start)
    ).one() or 0
    
    messages_7d = session.exec(
        select(func.count(Message.id))
        .where(Message.created_at >= week_ago)
    ).one() or 0
    
    messages_30d = session.exec(
        select(func.count(Message.id))
        .where(Message.created_at >= month_ago)
    ).one() or 0
    
    return AdminAnalyticsResponse(
        total_users=total_users or 0,
        total_workspaces=total_workspaces or 0,
        total_chatbots=total_chatbots or 0,
        total_conversations=total_conversations or 0,
        total_messages=total_messages or 0,
        active_users_24h=active_users_24h,
        active_users_7d=active_users_7d,
        active_users_30d=active_users_30d,
        new_users_today=new_users_today,
        new_users_7d=new_users_7d,
        new_users_30d=new_users_30d,
        users_by_type=users_by_type,
        conversations_today=conversations_today,
        conversations_7d=conversations_7d,
        conversations_30d=conversations_30d,
        messages_today=messages_today,
        messages_7d=messages_7d,
        messages_30d=messages_30d,
    )


class TicketResponse(BaseModel):
    id: int
    user_uuid: str
    email: str
    related_account: Optional[str] = None
    related_agent_uuid: Optional[str] = None
    problem_type: str
    severity: str
    subject: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime
    username: Optional[str] = None
    chatbot_name: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.get("/tickets", response_model=List[TicketResponse])
def get_all_tickets(
    session: Session = Depends(get_session),
    admin_user: User = Depends(require_admin)
):
    """Get all support tickets (admin only)"""
    tickets = session.exec(
        select(Ticket)
        .order_by(Ticket.created_at.desc())
    ).all()
    
    # Enrich with user and chatbot names
    result = []
    for ticket in tickets:
        user = session.get(User, ticket.user_uuid)
        chatbot = None
        if ticket.related_agent_uuid:
            chatbot = session.get(Chatbot, ticket.related_agent_uuid)
        
        result.append(TicketResponse(
            id=ticket.id,
            user_uuid=ticket.user_uuid,
            email=ticket.email,
            related_account=ticket.related_account,
            related_agent_uuid=ticket.related_agent_uuid,
            problem_type=ticket.problem_type,
            severity=ticket.severity,
            subject=ticket.subject,
            description=ticket.description,
            status=ticket.status,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            username=user.username if user else None,
            chatbot_name=chatbot.name if chatbot else None
        ))
    
    return result

