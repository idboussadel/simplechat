"""API routes for background task management."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from app.database import get_session
from app.models import BackgroundTask, User, Chatbot
from app.auth import get_current_user
from app.services.workspace_service import workspace_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


class TaskResponse(BaseModel):
    """Schema for task response."""
    id: int
    task_id: str
    task_type: str
    status: str
    progress: int
    result_data: Optional[str] = None
    error_message: Optional[str] = None
    resource_type: str
    resource_id: int
    chatbot_uuid: str
    user_uuid: str
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task_status(
    task_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get the status of a background task."""
    task = session.exec(
        select(BackgroundTask).where(BackgroundTask.task_id == task_id)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify ownership
    if task.user_uuid != current_user.uuid:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return task


@router.get("/resource/{resource_type}/{resource_id}", response_model=Optional[TaskResponse])
async def get_task_by_resource(
    resource_type: str,
    resource_id: int,
    chatbot_uuid: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get the most recent task for a specific resource (document, website_link, etc.)."""
    # Verify workspace access (allows workspace members)
    chatbot = session.get(Chatbot, chatbot_uuid)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get most recent task for this resource
    task = session.exec(
        select(BackgroundTask)
        .where(
            BackgroundTask.resource_type == resource_type,
            BackgroundTask.resource_id == resource_id,
            BackgroundTask.chatbot_uuid == chatbot_uuid
        )
        .order_by(BackgroundTask.created_at.desc())
    ).first()
    
    if not task:
        return None
    
    return task







