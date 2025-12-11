from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone

from app.database import get_session
from app.models import HandoffRequest, Conversation, Chatbot, User, Message
from app.services.handoff_service import handoff_service
from app.services.websocket_manager import manager
from app.services.workspace_service import workspace_service
from app.auth import get_current_user


router = APIRouter(prefix="/handoff", tags=["handoff"])


def serialize_datetime(dt):
    """Serialize datetime to ISO format with UTC timezone"""
    if dt is None:
        return None
    # If datetime is naive (no timezone), assume it's UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Ensure it ends with 'Z' for UTC
    iso_str = dt.isoformat()
    if not iso_str.endswith('Z') and dt.tzinfo == timezone.utc:
        iso_str = iso_str.replace('+00:00', 'Z')
    return iso_str


# Schemas
class HandoffRequestResponse(BaseModel):
    id: int
    conversation_uuid: str
    chatbot_uuid: str
    status: str
    requested_at: datetime
    accepted_at: Optional[datetime] = None
    accepted_by_user_uuid: Optional[str] = None
    resolved_at: Optional[datetime] = None
    reason: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    last_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class CreateHandoffRequest(BaseModel):
    conversation_uuid: str
    reason: Optional[str] = None


class AcceptHandoffRequest(BaseModel):
    handoff_request_id: int


class SendAgentMessageRequest(BaseModel):
    conversation_uuid: str
    content: str


class TakeOverRequest(BaseModel):
    conversation_uuid: str


# Endpoints
@router.post("/request", response_model=HandoffRequestResponse)
async def create_handoff_request(
    request: CreateHandoffRequest,
    session: Session = Depends(get_session)
):
    """Create a handoff request (called when user accepts handoff offer)"""
    # Get conversation
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == request.conversation_uuid)
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Create handoff request
    handoff_request = handoff_service.create_handoff_request(
        conversation_uuid=request.conversation_uuid,
        chatbot_uuid=conversation.chatbot_uuid,
        reason=request.reason,
        session=session
    )
    
    # Get conversation details for response
    last_message = session.exec(
        select(Message)
        .where(Message.conversation_uuid == request.conversation_uuid)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()
    
    response_data = {
        "id": handoff_request.id,
        "conversation_uuid": handoff_request.conversation_uuid,
        "chatbot_uuid": handoff_request.chatbot_uuid,
        "status": handoff_request.status,
        "requested_at": serialize_datetime(handoff_request.requested_at),
        "accepted_at": serialize_datetime(handoff_request.accepted_at),
        "accepted_by_user_uuid": handoff_request.accepted_by_user_uuid,
        "resolved_at": serialize_datetime(handoff_request.resolved_at),
        "reason": handoff_request.reason,
        "customer_name": conversation.customer_name,
        "customer_email": conversation.customer_email,
        "last_message": last_message.content if last_message else None
    }
    
    return response_data


@router.get("/pending/{chatbot_uuid}", response_model=List[HandoffRequestResponse])
async def get_pending_handoff_requests(
    chatbot_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all pending handoff requests for a chatbot"""
    # Verify user has access to the chatbot's workspace
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
    ).first()
    
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Check workspace access (allows workspace members)
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized to view this chatbot's handoff requests")
    
    # Get pending requests
    requests = handoff_service.get_pending_handoff_requests(
        chatbot_uuid=chatbot_uuid,
        session=session
    )
    
    # Also get conversations with handoff_status="requested" that might not have a handoff_request record yet
    # (fallback for race conditions)
    conversations_requested = session.exec(
        select(Conversation)
        .where(Conversation.chatbot_uuid == chatbot_uuid)
        .where(Conversation.handoff_status == "requested")
    ).all()
    
    # Create a set of conversation UUIDs that already have handoff requests
    existing_conversation_uuids = {req.conversation_uuid for req in requests}
    
    # Add handoff requests for conversations that are requested but don't have a request record
    for conv in conversations_requested:
        if conv.uuid not in existing_conversation_uuids:
            # Create a handoff request if it doesn't exist
            try:
                req = handoff_service.create_handoff_request(
                    conversation_uuid=conv.uuid,
                    chatbot_uuid=chatbot_uuid,
                    reason="Auto-created from conversation status",
                    session=session
                )
                requests.append(req)
            except Exception as e:
                print(f"Error creating handoff request for conversation {conv.uuid}: {e}")
    
    # Enrich with conversation details
    response_data = []
    for req in requests:
        conversation = session.exec(
            select(Conversation).where(Conversation.uuid == req.conversation_uuid)
        ).first()
        
        last_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == req.conversation_uuid)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        
        response_data.append({
            "id": req.id,
            "conversation_uuid": req.conversation_uuid,
            "chatbot_uuid": req.chatbot_uuid,
            "status": req.status,
            "requested_at": serialize_datetime(req.requested_at),
            "accepted_at": serialize_datetime(req.accepted_at),
            "accepted_by_user_uuid": req.accepted_by_user_uuid,
            "resolved_at": serialize_datetime(req.resolved_at),
            "reason": req.reason,
            "customer_name": conversation.customer_name if conversation else None,
            "customer_email": conversation.customer_email if conversation else None,
            "last_message": last_message.content if last_message else None
        })
    
    # Sort by requested_at descending
    response_data.sort(key=lambda x: x["requested_at"], reverse=True)
    
    return response_data


@router.post("/accept", response_model=HandoffRequestResponse)
async def accept_handoff_request(
    request: AcceptHandoffRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Accept a handoff request"""
    handoff_request = handoff_service.accept_handoff_request(
        handoff_request_id=request.handoff_request_id,
        user_uuid=current_user.uuid,
        session=session
    )
    
    # Get conversation details
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == handoff_request.conversation_uuid)
    ).first()
    
    last_message = session.exec(
        select(Message)
        .where(Message.conversation_uuid == handoff_request.conversation_uuid)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()
    
    response_data = {
        "id": handoff_request.id,
        "conversation_uuid": handoff_request.conversation_uuid,
        "chatbot_uuid": handoff_request.chatbot_uuid,
        "status": handoff_request.status,
        "requested_at": serialize_datetime(handoff_request.requested_at),
        "accepted_at": serialize_datetime(handoff_request.accepted_at),
        "accepted_by_user_uuid": handoff_request.accepted_by_user_uuid,
        "resolved_at": serialize_datetime(handoff_request.resolved_at),
        "reason": handoff_request.reason,
        "customer_name": conversation.customer_name if conversation else None,
        "customer_email": conversation.customer_email if conversation else None,
        "last_message": last_message.content if last_message else None
    }
    
    return response_data


@router.post("/message", response_model=Message)
async def send_agent_message(
    request: SendAgentMessageRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Send a message from an agent to the customer"""
    message = handoff_service.send_agent_message(
        conversation_uuid=request.conversation_uuid,
        agent_user_uuid=current_user.uuid,
        content=request.content,
        session=session
    )
    
    # Get the conversation to find the session_id for WebSocket broadcasting
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == request.conversation_uuid)
    ).first()
    
    if conversation:
        # Broadcast the agent message to the client via WebSocket
        session_id = conversation.session_id
        print(f"[Handoff] Broadcasting agent message to session {session_id}")
        
        try:
            await manager.send_message({
                "type": "message",
                "role": "agent",  # Use "agent" role so client knows it's from a human agent
                "content": request.content,
                "agent_name": current_user.username,  # Include agent's name
                "timestamp": message.created_at.isoformat() if hasattr(message.created_at, 'isoformat') else datetime.utcnow().isoformat()
            }, session_id)
            print(f"[Handoff] ✅ Agent message broadcasted successfully")
            
            # Also broadcast to dashboard (like WhatsApp)
            await manager.broadcast_to_dashboard({
                "type": "new_message",
                "conversation_uuid": request.conversation_uuid,
                "chatbot_uuid": conversation.chatbot_uuid,
                "role": "agent"
            }, conversation.chatbot_uuid)
        except Exception as e:
            print(f"[Handoff] ⚠️ Warning: Failed to broadcast agent message via WebSocket: {e}")
            # Don't fail the request if WebSocket fails - message is already saved to DB
            import traceback
            traceback.print_exc()
    
    return message


@router.post("/takeover", response_model=HandoffRequestResponse)
async def take_over_conversation(
    request: TakeOverRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Take over a conversation (create handoff request if needed and accept it immediately)"""
    # Get conversation
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == request.conversation_uuid)
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Verify user has access to chatbot's workspace
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == conversation.chatbot_uuid)
    ).first()
    
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Check workspace access (allows workspace members)
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Not authorized to take over this conversation")
    
    # Check if handoff request already exists
    handoff_request = handoff_service.get_handoff_request_by_conversation(
        conversation_uuid=request.conversation_uuid,
        session=session
    )
    
    # If no handoff request exists or it's not accepted, create/accept it
    if not handoff_request:
        # Create handoff request
        handoff_request = handoff_service.create_handoff_request(
            conversation_uuid=request.conversation_uuid,
            chatbot_uuid=conversation.chatbot_uuid,
            reason="Manual takeover",
            session=session
        )
    
    # Accept the handoff request if it's still pending
    if handoff_request.status == "pending":
        handoff_request = handoff_service.accept_handoff_request(
            handoff_request_id=handoff_request.id,
            user_uuid=current_user.uuid,
            session=session
        )
    
    # Get last message for response
    last_message = session.exec(
        select(Message)
        .where(Message.conversation_uuid == request.conversation_uuid)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()
    
    response_data = {
        "id": handoff_request.id,
        "conversation_uuid": handoff_request.conversation_uuid,
        "chatbot_uuid": handoff_request.chatbot_uuid,
        "status": handoff_request.status,
        "requested_at": serialize_datetime(handoff_request.requested_at),
        "accepted_at": serialize_datetime(handoff_request.accepted_at),
        "accepted_by_user_uuid": handoff_request.accepted_by_user_uuid,
        "resolved_at": serialize_datetime(handoff_request.resolved_at),
        "reason": handoff_request.reason,
        "customer_name": conversation.customer_name,
        "customer_email": conversation.customer_email,
        "last_message": last_message.content if last_message else None
    }
    
    return response_data


@router.get("/conversation/{conversation_uuid}")
async def get_handoff_status(
    conversation_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get handoff status for a conversation"""
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == conversation_uuid)
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Verify user has access (owns chatbot or is assigned)
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == conversation.chatbot_uuid)
    ).first()
    
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Check workspace access (allows workspace members) or if user is assigned
    try:
        workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
    except HTTPException:
        # If not a workspace member, check if user is assigned to the conversation
        if conversation.assigned_to_user_uuid != current_user.uuid:
            raise HTTPException(status_code=403, detail="Not authorized to view this conversation")
    
    handoff_request = handoff_service.get_handoff_request_by_conversation(
        conversation_uuid=conversation_uuid,
        session=session
    )
    
    return {
        "handoff_status": conversation.handoff_status,
        "assigned_to_user_uuid": conversation.assigned_to_user_uuid,
        "handoff_request": {
            "id": handoff_request.id,
            "status": handoff_request.status,
            "requested_at": serialize_datetime(handoff_request.requested_at),
            "accepted_at": serialize_datetime(handoff_request.accepted_at),
            "accepted_by_user_uuid": handoff_request.accepted_by_user_uuid
        } if handoff_request else None
    }

