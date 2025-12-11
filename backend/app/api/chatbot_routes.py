from typing import List, Optional
from fastapi import Query
from fastapi import APIRouter, Depends, status, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from app.database import get_session
from app.models import User, Chatbot
from app.schemas import ChatbotCreate, ChatbotUpdate, ChatbotResponse
from app.auth import get_current_user
from app.services.chatbot_service import ChatbotService
from pydantic import BaseModel
import os

router = APIRouter(prefix="/chatbots", tags=["Chatbots"])


@router.post("", response_model=ChatbotResponse, status_code=status.HTTP_201_CREATED)
def create_chatbot(
    chatbot_data: ChatbotCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create a new chatbot for the authenticated user"""
    return ChatbotService.create_chatbot(chatbot_data, current_user.uuid, session)


@router.get("", response_model=List[ChatbotResponse])
def get_my_chatbots(
    workspace_uuid: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all chatbots for the authenticated user, optionally filtered by workspace"""
    return ChatbotService.get_user_chatbots(current_user.uuid, session, workspace_uuid=workspace_uuid)


@router.get("/{chatbot_uuid}", response_model=ChatbotResponse)
def get_chatbot(
    chatbot_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get a specific chatbot by UUID"""
    return ChatbotService.verify_chatbot_ownership(chatbot_uuid, current_user.uuid, session)


@router.patch("/{chatbot_uuid}", response_model=ChatbotResponse)
def update_chatbot(
    chatbot_uuid: str,
    chatbot_update: ChatbotUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update a chatbot"""
    return ChatbotService.update_chatbot(chatbot_uuid, chatbot_update, current_user.uuid, session)


@router.delete("/{chatbot_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chatbot(
    chatbot_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a chatbot"""
    ChatbotService.delete_chatbot(chatbot_uuid, current_user.uuid, session)
    return None


class EmbedCodeResponse(BaseModel):
    embed_code: str
    chatbot_uuid: str
    chatbot_name: str


@router.get("/{chatbot_uuid}/embed", response_model=EmbedCodeResponse)
def get_embed_code(
    chatbot_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get embed code for a chatbot"""
    chatbot = ChatbotService.verify_chatbot_ownership(chatbot_uuid, current_user.uuid, session)
    
    if not chatbot.is_active:
        raise HTTPException(
            status_code=400,
            detail="Cannot generate embed code for inactive chatbot"
        )
    
    # Get API URL from environment or use default
    api_url = os.getenv("API_URL", "http://localhost:8000")
    # Remove protocol for WebSocket URL construction
    api_url_clean = api_url.replace("https://", "").replace("http://", "")
    
    # Generate embed code
    embed_code = f'''<script 
  src="{api_url}/widget.js" 
  data-chatbot-uuid="{chatbot.uuid}" 
  data-api-url="{api_url}"
  async>
</script>'''
    
    return EmbedCodeResponse(
        embed_code=embed_code,
        chatbot_uuid=chatbot.uuid,
        chatbot_name=chatbot.name
    )


class PublicChatbotInfo(BaseModel):
    uuid: str
    name: str
    is_active: bool
    color_primary: str
    color_user_message: str
    color_bot_message: str
    color_background: str
    border_radius_chatbot: int
    border_radius_messages: int
    border_radius_input: int
    color_primary_dark: Optional[str] = None
    color_user_message_dark: Optional[str] = None
    color_bot_message_dark: Optional[str] = None
    color_background_dark: Optional[str] = None
    welcome_message: Optional[str] = None
    example_messages: Optional[str] = None
    window_width: int
    window_height: int
    popup_message_1: Optional[str] = None
    popup_message_2: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.get("/{chatbot_uuid}/public")
def get_public_chatbot_info(
    chatbot_uuid: str,
    session: Session = Depends(get_session)
):
    """Get public information about a chatbot (for widget) - allows CORS from any origin"""
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
    ).first()
    
    if not chatbot:
        return JSONResponse(
            status_code=404,
            content={"detail": "Chatbot not found"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    # Return with CORS headers to allow widget embedding from any origin
    response_data = PublicChatbotInfo(
        uuid=chatbot.uuid,
        name=chatbot.name,
        is_active=chatbot.is_active,
        color_primary=chatbot.color_primary,
        color_user_message=chatbot.color_user_message,
        color_bot_message=chatbot.color_bot_message,
        color_background=chatbot.color_background,
        border_radius_chatbot=chatbot.border_radius_chatbot,
        border_radius_messages=chatbot.border_radius_messages,
        border_radius_input=chatbot.border_radius_input,
        color_primary_dark=chatbot.color_primary_dark,
        color_user_message_dark=chatbot.color_user_message_dark,
        color_bot_message_dark=chatbot.color_bot_message_dark,
        color_background_dark=chatbot.color_background_dark,
        welcome_message=chatbot.welcome_message,
        example_messages=chatbot.example_messages,
        window_width=chatbot.window_width,
        window_height=chatbot.window_height,
        popup_message_1=chatbot.popup_message_1,
        popup_message_2=chatbot.popup_message_2
    )
    
    return JSONResponse(
        content=response_data.model_dump(),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )
