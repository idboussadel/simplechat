"""API routes for website link management."""
import logging
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel, HttpUrl
from app.database import get_session
from app.models import WebsiteLink, Chatbot, User
from app.auth import get_current_user
from app.services.pinecone_service import PineconeService
from app.services.workspace_service import workspace_service

logger = logging.getLogger(__name__)

router = APIRouter()


class WebsiteLinkCreate(BaseModel):
    """Schema for creating a website link."""
    url: HttpUrl
    crawl_mode: str = "crawl"  # "crawl" or "individual"


class WebsiteLinkResponse(BaseModel):
    """Schema for website link response."""
    id: int
    chatbot_uuid: str
    url: str
    title: str | None
    link_count: int
    chunk_count: int
    status: str
    error_message: str | None
    last_crawled_at: datetime | None
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.post("/{chatbot_uuid}/links", response_model=WebsiteLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_website_link(
    chatbot_uuid: str,
    link_data: WebsiteLinkCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Add a new website link to crawl for a chatbot."""
    # Verify workspace access (allows workspace members)
    chatbot = session.get(Chatbot, chatbot_uuid)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Convert HttpUrl to string
    url_str = str(link_data.url)
    
    # Check if URL already exists for this chatbot
    existing = session.exec(
        select(WebsiteLink).where(
            WebsiteLink.chatbot_uuid == chatbot_uuid,
            WebsiteLink.url == url_str,
            WebsiteLink.status != "removed"
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This URL has already been added to this chatbot"
        )
    
    # Create website link record
    website_link = WebsiteLink(
        chatbot_uuid=chatbot_uuid,
        url=url_str,
        status="pending"
    )
    
    session.add(website_link)
    session.commit()
    session.refresh(website_link)
    
    # Queue website crawling task
    from app.tasks import crawl_website_task
    crawl_mode = link_data.crawl_mode if hasattr(link_data, 'crawl_mode') else "crawl"
    task = crawl_website_task.delay(
        website_link.id,
        chatbot_uuid,
        current_user.uuid,
        url_str,
        crawl_mode
    )
    
    logger.info(f"Queued website crawling task {task.id} for website link {website_link.id}")
    
    return website_link


@router.get("/{chatbot_uuid}/links", response_model=List[WebsiteLinkResponse])
async def get_website_links(
    chatbot_uuid: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all website links for a chatbot."""
    # Verify workspace access (allows workspace members)
    chatbot = session.get(Chatbot, chatbot_uuid)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all links that are not removed
    links = session.exec(
        select(WebsiteLink).where(
            WebsiteLink.chatbot_uuid == chatbot_uuid,
            WebsiteLink.status != "removed"
        ).order_by(WebsiteLink.created_at.desc())
    ).all()
    
    return links


@router.delete("/{chatbot_uuid}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_website_link(
    chatbot_uuid: str,
    link_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Delete a website link and its associated embeddings."""
    # Get the link
    website_link = session.get(WebsiteLink, link_id)
    if not website_link:
        raise HTTPException(status_code=404, detail="Website link not found")
    
    if website_link.chatbot_uuid != chatbot_uuid:
        raise HTTPException(status_code=403, detail="Link does not belong to this chatbot")
    
    # Verify workspace access (allows workspace members)
    chatbot = session.get(Chatbot, chatbot_uuid)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        # Delete vectors from Pinecone
        pinecone_service = PineconeService()
        pinecone_service.delete_source_vectors(
            source_type="website",
            source_id=str(link_id),
            chatbot_uuid=chatbot_uuid
        )
        
        # Delete from database
        session.delete(website_link)
        session.commit()
        
        logger.info(f"Deleted website link {link_id} and its embeddings")
        
    except Exception as e:
        logger.error(f"Failed to delete website link {link_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete website link")


@router.post("/{chatbot_uuid}/links/{link_id}/recrawl", response_model=WebsiteLinkResponse)
async def recrawl_website_link(
    chatbot_uuid: str,
    link_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Recrawl a website link to update its content."""
    # Get the link
    website_link = session.get(WebsiteLink, link_id)
    if not website_link:
        raise HTTPException(status_code=404, detail="Website link not found")
    
    if website_link.chatbot_uuid != chatbot_uuid:
        raise HTTPException(status_code=403, detail="Link does not belong to this chatbot")
    
    # Verify workspace access (allows workspace members)
    chatbot = session.get(Chatbot, chatbot_uuid)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Delete old vectors
    try:
        pinecone_service = PineconeService()
        pinecone_service.delete_source_vectors(
            source_type="website",
            source_id=str(link_id),
            chatbot_uuid=chatbot_uuid
        )
    except Exception as e:
        logger.warning(f"Failed to delete old vectors for link {link_id}: {str(e)}")
    
    # Reset link status
    website_link.status = "pending"
    website_link.error_message = None
    website_link.link_count = 0
    website_link.chunk_count = 0
    session.add(website_link)
    session.commit()
    session.refresh(website_link)
    
    # Queue website crawling task (recrawl always uses crawl mode)
    from app.tasks import crawl_website_task
    task = crawl_website_task.delay(
        website_link.id,
        chatbot_uuid,
        current_user.uuid,
        website_link.url,
        "crawl"
    )
    
    logger.info(f"Queued website recrawl task {task.id} for website link {website_link.id}")
    
    return website_link

