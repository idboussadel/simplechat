from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import Ticket, User, Chatbot
from app.auth import get_current_user
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/tickets", tags=["Tickets"])


class TicketCreate(BaseModel):
    email: EmailStr
    related_account: Optional[str] = None
    related_agent_uuid: Optional[str] = None
    problem_type: str
    severity: str
    subject: str
    description: str


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
    
    class Config:
        from_attributes = True


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    ticket_data: TicketCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create a new support ticket"""
    
    # Validate related_agent_uuid if provided
    if ticket_data.related_agent_uuid:
        chatbot = session.exec(
            select(Chatbot).where(Chatbot.uuid == ticket_data.related_agent_uuid)
        ).first()
        if not chatbot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Related agent not found"
            )
        # Verify workspace access (allows workspace members)
        from app.services.workspace_service import workspace_service
        try:
            workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this agent"
            )
    
    # Create ticket
    ticket = Ticket(
        user_uuid=current_user.uuid,
        email=ticket_data.email,
        related_account=ticket_data.related_account,
        related_agent_uuid=ticket_data.related_agent_uuid,
        problem_type=ticket_data.problem_type,
        severity=ticket_data.severity,
        subject=ticket_data.subject,
        description=ticket_data.description,
        status="open"
    )
    
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    
    return ticket

