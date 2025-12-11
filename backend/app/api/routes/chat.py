from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from app.models import Conversation, Message, Chatbot, User
from app.services.chat_service import ChatService
from app.services.websocket_manager import manager
from app.services.conversation_details_service import conversation_details_service
from app.database import get_session
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from sqlalchemy import text, func
import uuid as uuid_pkg


router = APIRouter(prefix="/chat", tags=["chat"])


# Add OPTIONS handler for feedback endpoint to handle CORS preflight
@router.options("/messages/{message_id}/feedback")
async def options_feedback(message_id: int):
    """Handle CORS preflight for feedback endpoint"""
    return JSONResponse(
        status_code=200,
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600",
        }
    )
chat_service = ChatService()


# Schemas
class MessageResponse(BaseModel):
    id: int
    conversation_uuid: str
    role: str
    content: str
    feedback: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v.tzinfo else v.replace(tzinfo=timezone.utc).isoformat()
        }


class ConversationResponse(BaseModel):
    uuid: str
    chatbot_uuid: str
    session_id: str
    customer_name: Optional[str]
    customer_email: Optional[str]
    customer_phone: Optional[str]
    status: str
    handoff_status: Optional[str] = None
    assigned_to_user_uuid: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_message: Optional[str] = None
    last_user_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class PaginatedConversationsResponse(BaseModel):
    conversations: List[ConversationResponse]
    has_more: bool
    total: Optional[int] = None


class SendMessageRequest(BaseModel):
    message: str
    session_id: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None


class SubmitFeedbackRequest(BaseModel):
    feedback: Literal["like", "dislike"] = Field(..., description="Feedback type: 'like' or 'dislike'")


# WebSocket endpoint
@router.websocket("/ws/{chatbot_uuid}")
async def websocket_endpoint(
    websocket: WebSocket,
    chatbot_uuid: str,
    session_id: str = Query(...),
    client_uuid: Optional[str] = Query(None),
    session: Session = Depends(get_session)
):
    """WebSocket endpoint for real-time chat - allows connections from any origin for widget embedding"""
    await manager.connect(websocket, session_id, chatbot_uuid)
    
    try:
        # Verify chatbot exists
        chatbot = session.exec(
            select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
        ).first()
        
        if not chatbot:
            await websocket.send_json({
                "type": "error",
                "message": "Chatbot not found"
            })
            await websocket.close(code=4004, reason="Chatbot not found")
            manager.disconnect(websocket, session_id)
            return
        
        # Check if chatbot is active
        if not chatbot.is_active:
            await websocket.send_json({
                "type": "error",
                "message": "Chatbot is not active"
            })
            await websocket.close(code=4003, reason="Chatbot is not active")
            manager.disconnect(websocket, session_id)
            return
        
        # Don't create conversation yet - wait for first message
        conversation = None
        
        # Send connection success message
        await websocket.send_json({
            "type": "connection",
            "status": "connected"
        })
        
        # Check if this is a dashboard connection (just listening, not processing messages)
        is_dashboard = session_id.startswith("dashboard_")
        
        if is_dashboard:
            # Dashboard connections just listen for broadcasts
            print(f"[WS] Dashboard listener connected: {session_id}")
            # Keep connection alive - it will receive broadcasts from other parts
            try:
                while True:
                    # Just wait - connection will receive broadcasts
                    await websocket.receive_text()  # Keep connection alive
            except Exception as e:
                print(f"[WS] Dashboard connection closed: {e}")
                manager.disconnect(websocket, session_id)
                return
        
        # Listen for messages (widget connections only)
        while True:
            print(f"[WS] Waiting for message from session {session_id}...")
            data = await websocket.receive_json()
            print(f"[WS] ✅ Received data: {data}")
            
            message_type = data.get("type")
            print(f"[WS] Message type: {message_type}")
            
            # Handle ping messages (keep-alive)
            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            
            if message_type == "message":
                user_message = data.get("message")
                print(f"[WS] User message: '{user_message}'")
                
                if not user_message:
                    print(f"[WS] ⚠️ Empty message, skipping")
                    continue
                
                # Create conversation on first message
                if conversation is None:
                    try:
                        # Generate client_uuid if not provided
                        final_client_uuid = client_uuid
                        if not final_client_uuid:
                            final_client_uuid = str(uuid_pkg.uuid4())
                            print(f"[WS] Generated new client_uuid: {final_client_uuid}")
                        else:
                            print(f"[WS] Using provided client_uuid: {final_client_uuid}")
                        
                        print(f"[WS] Creating conversation for session {session_id} with client_uuid {final_client_uuid}...")
                        conversation = chat_service.get_or_create_conversation(
                            chatbot_uuid=chatbot_uuid,
                            session_id=session_id,
                            client_uuid=final_client_uuid,
                            session=session
                        )
                        
                        if not conversation:
                            raise ValueError("Failed to create conversation: get_or_create_conversation returned None")
                        
                        print(f"[WS] ✅ Conversation created: {conversation.uuid}")
                        
                        # Send conversation_uuid and client_uuid to client
                        await manager.send_message({
                            "type": "conversation_created",
                            "conversation_uuid": conversation.uuid,
                            "client_uuid": final_client_uuid,
                            "session_id": session_id
                        }, session_id)
                        
                        # Broadcast new conversation to dashboard (like WhatsApp)
                        await manager.broadcast_to_dashboard({
                            "type": "conversation_created",
                            "conversation_uuid": conversation.uuid,
                            "chatbot_uuid": chatbot_uuid
                        }, chatbot_uuid)
                    except Exception as e:
                        print(f"[WS] ❌ Error creating conversation: {e}")
                        import traceback
                        traceback.print_exc()
                        await manager.send_message({
                            "type": "error",
                            "message": "Failed to initialize conversation"
                        }, session_id)
                        continue
                
                # Always refresh conversation from database to get latest handoff_status
                # This ensures we have the most up-to-date status after a human takes over
                session.refresh(conversation)
                print(f"[WS] Conversation handoff_status: {conversation.handoff_status}, assigned_to: {conversation.assigned_to_user_uuid}")
                
                # Check if conversation is in human handoff mode
                if conversation.handoff_status == "human":
                    print(f"[WS] ⚠️ Conversation is in human handoff mode - AI will not respond")
                    # Save user message but don't process with AI
                    # Don't echo it back - widget already shows it optimistically
                    user_msg = Message(
                        conversation_uuid=conversation.uuid,
                        role="user",
                        content=user_message
                    )
                    session.add(user_msg)
                    conversation.updated_at = datetime.utcnow()
                    session.add(conversation)
                    session.commit()
                    
                    # Extract and update conversation details
                    conversation_details_service.update_conversation_details(
                        conversation=conversation,
                        message_text=user_message,
                        session=session
                    )
                    
                    # Broadcast new message to dashboard (like WhatsApp)
                    await manager.broadcast_to_dashboard({
                        "type": "new_message",
                        "conversation_uuid": conversation.uuid,
                        "chatbot_uuid": chatbot_uuid,
                        "role": "user"
                    }, chatbot_uuid)
                    
                    # The agent will see it in the Activity page
                    # AI will NOT respond - only human agents can respond now
                    print(f"[WS] ✅ User message saved, waiting for human agent response")
                    continue
                
                # In this case, just save the message and let the agent handle it
                if conversation.handoff_status == "requested":
                    # Save user message
                    user_msg = Message(
                        conversation_uuid=conversation.uuid,
                        role="user",
                        content=user_message
                    )
                    session.add(user_msg)
                    conversation.updated_at = datetime.utcnow()
                    session.add(conversation)
                    session.commit()
                    
                    # Extract and update conversation details
                    conversation_details_service.update_conversation_details(
                        conversation=conversation,
                        message_text=user_message,
                        session=session
                    )
                    
                    # Broadcast new message to dashboard (like WhatsApp)
                    await manager.broadcast_to_dashboard({
                        "type": "new_message",
                        "conversation_uuid": conversation.uuid,
                        "chatbot_uuid": chatbot_uuid,
                        "role": "user"
                    }, chatbot_uuid)
                    
                    # Send acknowledgment that message was received
                    await manager.send_message({
                        "type": "message",
                        "role": "assistant",
                        "content": "Your message has been received. A customer service representative will respond shortly.",
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }, session_id)
                    continue
                
                # Send typing indicator
                print(f"[WS] Sending typing indicator...")
                await manager.send_message({
                    "type": "typing",
                    "is_typing": True
                }, session_id)
                print(f"[WS] ✅ Typing indicator sent")
                
                try:
                    # Process message with RAG and stream the AI response
                    print(f"[WS] Processing message with AI (streaming) for conversation {conversation.uuid}...")

                    async def handle_chunk(delta: str) -> None:
                        """Send incremental assistant chunks to the client."""
                        await manager.send_message(
                            {
                                "type": "message_chunk",
                                "role": "assistant",
                                "content": delta,
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                            },
                            session_id,
                        )

                    ai_response = await chat_service.stream_message(
                        chatbot_uuid=chatbot_uuid,
                        conversation_uuid=conversation.uuid,
                        user_message=user_message,
                        session=session,
                        on_chunk=handle_chunk,
                    )

                    print(f"[WS] ✅ AI streaming completed. Final response: {ai_response[:100]}...")

                    # Stop typing indicator
                    print(f"[WS] Stopping typing indicator...")
                    await manager.send_message({
                        "type": "typing",
                        "is_typing": False
                    }, session_id)
                    print(f"[WS] ✅ Typing stopped")

                    # Get the last assistant message to include its ID
                    last_message = session.exec(
                        select(Message)
                        .where(Message.conversation_uuid == conversation.uuid)
                        .where(Message.role == "assistant")
                        .order_by(Message.created_at.desc())
                        .limit(1)
                    ).first()

                    # Notify client that the message stream is complete
                    complete_payload = {
                        "type": "message_complete",
                        "role": "assistant",
                        "content": ai_response,
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }
                    if last_message:
                        complete_payload["id"] = last_message.id
                    await manager.send_message(complete_payload, session_id)

                    # Broadcast new message to dashboard (like WhatsApp)
                    await manager.broadcast_to_dashboard({
                        "type": "new_message",
                        "conversation_uuid": conversation.uuid,
                        "chatbot_uuid": chatbot_uuid,
                        "role": "assistant"
                    }, chatbot_uuid)

                except Exception as e:
                    print(f"[WS] ❌ Error processing message (streaming): {e}")
                    import traceback
                    traceback.print_exc()
                    # Stop typing indicator
                    await manager.send_message({
                        "type": "typing",
                        "is_typing": False
                    }, session_id)
                    # Send the actual error message to the client
                    error_message = str(e) if str(e) else "Failed to process message"
                    await manager.send_message({
                        "type": "error",
                        "message": error_message
                    }, session_id)
            
            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, session_id)


# REST endpoints
@router.post("/{chatbot_uuid}/send", response_model=MessageResponse)
async def send_message(
    chatbot_uuid: str,
    request: SendMessageRequest,
    session: Session = Depends(get_session)
):
    """Send a message to the chatbot (REST endpoint as fallback)"""
    
    # Verify chatbot exists
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
    ).first()
    
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Get or create conversation
    # Note: REST endpoint doesn't support client_uuid yet, but can be added if needed
    conversation = chat_service.get_or_create_conversation(
        chatbot_uuid=chatbot_uuid,
        session_id=request.session_id,
        session=session
    )
    
    # Update customer info if provided
    if request.customer_name:
        conversation.customer_name = request.customer_name
    if request.customer_email:
        conversation.customer_email = request.customer_email
    session.add(conversation)
    session.commit()
    
    # Process message
    try:
        ai_response = await chat_service.process_message(
            chatbot_uuid=chatbot_uuid,
            conversation_uuid=conversation.uuid,
            user_message=request.message,
            session=session
        )
        
        # Get the last assistant message
        last_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conversation.uuid)
            .where(Message.role == "assistant")
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        
        return last_message
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chatbot_uuid}/conversations", response_model=PaginatedConversationsResponse)
async def get_conversations(
    chatbot_uuid: str,
    status_filter: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    """Get paginated conversations for a chatbot"""
    
    # Build base query
    query = select(Conversation).where(Conversation.chatbot_uuid == chatbot_uuid)
    
    if status_filter:
        query = query.where(Conversation.status == status_filter)
    
    # Get total count for pagination info
    count_query = select(func.count()).select_from(Conversation).where(Conversation.chatbot_uuid == chatbot_uuid)
    if status_filter:
        count_query = count_query.where(Conversation.status == status_filter)
    total = session.exec(count_query).one()
    
    # Apply pagination
    conversations = session.exec(
        query.order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(limit + 1)  # Fetch one extra to check if there are more
    ).all()
    
    # Check if there are more results
    has_more = len(conversations) > limit
    if has_more:
        conversations = conversations[:limit]  # Remove the extra item
    
    # Enrich conversations with last message and last user message
    enriched_conversations = []
    for conv in conversations:
        # Get last message (any role)
        last_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conv.uuid)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        
        # Get last user message
        last_user_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conv.uuid)
            .where(Message.role == "user")
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        
        # Create response dict with additional fields
        # Ensure dates are timezone-aware and serialized with 'Z' suffix
        def serialize_datetime(dt):
            """Serialize datetime to ISO format with UTC timezone"""
            if dt is None:
                return None
            # If datetime is naive (no timezone), assume it's UTC
            if dt.tzinfo is None:
                from datetime import timezone
                dt = dt.replace(tzinfo=timezone.utc)
            # Ensure it ends with 'Z' for UTC
            iso_str = dt.isoformat()
            if not iso_str.endswith('Z') and dt.tzinfo == timezone.utc:
                iso_str = iso_str.replace('+00:00', 'Z')
            return iso_str
        
        conv_dict = {
            "uuid": conv.uuid,
            "chatbot_uuid": conv.chatbot_uuid,
            "session_id": conv.session_id,
            "customer_name": conv.customer_name,
            "customer_email": conv.customer_email,
            "customer_phone": conv.customer_phone,
            "status": conv.status,
            "handoff_status": conv.handoff_status,
            "assigned_to_user_uuid": conv.assigned_to_user_uuid,
            "created_at": serialize_datetime(conv.created_at),
            "updated_at": serialize_datetime(conv.updated_at),
            "last_message": last_message.content if last_message else None,
            "last_user_message": last_user_message.content if last_user_message else None,
        }
        enriched_conversations.append(conv_dict)
    
    return PaginatedConversationsResponse(
        conversations=enriched_conversations,
        has_more=has_more,
        total=total
    )


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    session: Session = Depends(get_session)
) -> Optional[User]:
    """Optional authentication - returns user if token is valid, None otherwise"""
    if not credentials:
        return None
    try:
        from app.auth import decode_token
        token = credentials.credentials
        payload = decode_token(token)
        user_uuid: str = payload.get("sub")
        if user_uuid:
            user = session.get(User, user_uuid)
            if user and user.is_active:
                return user
    except:
        pass
    return None


@router.get("/conversations/{conversation_uuid}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_uuid: str,
    session_id: Optional[str] = Query(None, description="Session ID to validate access (for widget)"),
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Get messages for a specific conversation. 
    For widget: requires session_id. 
    For dashboard: requires authentication and conversation must belong to user's chatbot."""
    
    # Get conversation
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == conversation_uuid)
    ).first()
    
    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )
    
    # Validate access: either by session_id (widget) or by authentication (dashboard)
    has_access = False
    
    if session_id:
        # Widget access: verify conversation belongs to this session_id
        if conversation.session_id == session_id:
            has_access = True
        else:
            raise HTTPException(
                status_code=403,
                detail="Access denied: session_id mismatch"
            )
    elif current_user:
        # Dashboard access: verify user has workspace access
        chatbot = session.exec(
            select(Chatbot).where(Chatbot.uuid == conversation.chatbot_uuid)
        ).first()
        
        if chatbot:
            from app.services.workspace_service import workspace_service
            try:
                workspace_service.check_workspace_access(chatbot.workspace_uuid, current_user, session)
            except HTTPException:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied: you don't have access to this chatbot"
                )
        else:
            raise HTTPException(
                status_code=403,
                detail="Access denied: chatbot not found"
            )
    else:
        # No session_id and no authentication
        raise HTTPException(
            status_code=401,
            detail="Authentication required or session_id must be provided"
        )
    
    # Fetch messages if access is granted
    messages = session.exec(
        select(Message)
        .where(Message.conversation_uuid == conversation_uuid)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    
    return messages


@router.get("/{chatbot_uuid}/conversations/by-session", response_model=PaginatedConversationsResponse)
async def get_conversations_by_session(
    chatbot_uuid: str,
    session_id: Optional[str] = Query(None, description="Session ID to get conversations for (backward compatibility)"),
    client_uuid: Optional[str] = Query(None, description="Client UUID to get conversations for"),
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    """Get conversations for a specific client_uuid or session_id - secure endpoint for widget"""
    
    # Prefer client_uuid over session_id for grouping conversations
    if client_uuid:
        # Build query with client_uuid filter
        query = select(Conversation).where(
            Conversation.chatbot_uuid == chatbot_uuid
        ).where(
            Conversation.client_uuid == client_uuid
        )
        
        if status_filter:
            query = query.where(Conversation.status == status_filter)
        
        # Get total count
        count_query = select(func.count()).select_from(Conversation).where(
            Conversation.chatbot_uuid == chatbot_uuid
        ).where(
            Conversation.client_uuid == client_uuid
        )
        if status_filter:
            count_query = count_query.where(Conversation.status == status_filter)
    elif session_id:
        # Fallback to session_id for backward compatibility
        query = select(Conversation).where(
            Conversation.chatbot_uuid == chatbot_uuid
        ).where(
            Conversation.session_id == session_id
        )
        
        if status_filter:
            query = query.where(Conversation.status == status_filter)
        
        # Get total count
        count_query = select(func.count()).select_from(Conversation).where(
            Conversation.chatbot_uuid == chatbot_uuid
        ).where(
            Conversation.session_id == session_id
        )
        if status_filter:
            count_query = count_query.where(Conversation.status == status_filter)
    else:
        raise HTTPException(
            status_code=400,
            detail="Either client_uuid or session_id must be provided"
        )
    
    total = session.exec(count_query).one()
    
    # Apply pagination
    conversations = session.exec(
        query.order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    
    # Check if there are more results
    has_more = len(conversations) > limit
    if has_more:
        conversations = conversations[:limit]
    
    # Enrich conversations with last message and title
    enriched_conversations = []
    for conv in conversations:
        # Get first user message for title
        first_user_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conv.uuid)
            .where(Message.role == "user")
            .order_by(Message.created_at.asc())
            .limit(1)
        ).first()
        
        # Get last message
        last_message = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conv.uuid)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        
        def serialize_datetime(dt):
            if dt is None:
                return None
            if dt.tzinfo is None:
                from datetime import timezone
                dt = dt.replace(tzinfo=timezone.utc)
            iso_str = dt.isoformat()
            if not iso_str.endswith('Z') and dt.tzinfo == timezone.utc:
                iso_str = iso_str.replace('+00:00', 'Z')
            return iso_str
        
        # Generate title from first user message
        title = None
        if first_user_message:
            title = first_user_message.content.strip()
            if len(title) > 50:
                title = title[:50] + "..."
        
        conv_dict = {
            "uuid": conv.uuid,
            "chatbot_uuid": conv.chatbot_uuid,
            "session_id": conv.session_id,
            "customer_name": conv.customer_name,
            "customer_email": conv.customer_email,
            "customer_phone": conv.customer_phone,
            "status": conv.status,
            "handoff_status": conv.handoff_status,
            "assigned_to_user_uuid": conv.assigned_to_user_uuid,
            "created_at": serialize_datetime(conv.created_at),
            "updated_at": serialize_datetime(conv.updated_at),
            "last_message": last_message.content if last_message else None,
            "last_user_message": title,  # Use title as last_user_message for widget
        }
        enriched_conversations.append(conv_dict)
    
    return PaginatedConversationsResponse(
        conversations=enriched_conversations,
        has_more=has_more,
        total=total
    )


@router.patch("/conversations/{conversation_uuid}/status")
async def update_conversation_status(
    conversation_uuid: str,
    status: str,
    session: Session = Depends(get_session)
):
    """Update conversation status (active/archived)"""
    
    conversation = session.exec(
        select(Conversation).where(Conversation.uuid == conversation_uuid)
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation.status = status
    session.add(conversation)
    session.commit()
    
    return {"message": "Status updated", "status": status}


@router.post("/messages/{message_id}/feedback")
async def submit_feedback(
    message_id: int,
    request: SubmitFeedbackRequest,
    session: Session = Depends(get_session)
):
    """Submit feedback (like/dislike) for an AI assistant message - allows CORS from any origin for widget embedding"""
    
    # Get the message
    message = session.exec(
        select(Message).where(Message.id == message_id)
    ).first()
    
    if not message:
        # Return with CORS headers for widget embedding
        return JSONResponse(
            status_code=404,
            content={"detail": "Message not found"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    # Only assistant messages can receive feedback
    if message.role != "assistant":
        # Return with CORS headers for widget embedding
        return JSONResponse(
            status_code=400,
            content={"detail": "Feedback can only be submitted for assistant messages"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    # Update feedback
    message.feedback = request.feedback
    session.add(message)
    session.commit()
    session.refresh(message)
    
    # Return with CORS headers for widget embedding
    return JSONResponse(
        status_code=200,
        content=jsonable_encoder(message),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


@router.delete("/{chatbot_uuid}/conversations/cleanup", status_code=status.HTTP_204_NO_CONTENT)
async def cleanup_empty_conversations(
    chatbot_uuid: str,
    session: Session = Depends(get_session)
):
    """Delete all conversations with no messages for a specific chatbot"""
    
    # Get all conversation UUIDs that have messages
    message_query = select(Message.conversation_uuid).distinct()
    conversation_uuids_with_messages = session.exec(message_query).all()
    
    # Find conversations without messages for this chatbot
    conversations_to_delete = session.exec(
        select(Conversation).where(
            Conversation.chatbot_uuid == chatbot_uuid,
            Conversation.uuid.not_in(conversation_uuids_with_messages)
        )
    ).all()
    
    # Delete them
    for conv in conversations_to_delete:
        session.delete(conv)
    
    session.commit()
    
    return None


class AnalyticsResponse(BaseModel):
    total_conversations: int
    total_messages: int
    total_thumbs_up: int
    total_thumbs_down: int


@router.get("/{chatbot_uuid}/analytics", response_model=AnalyticsResponse)
async def get_chatbot_analytics(
    chatbot_uuid: str,
    session: Session = Depends(get_session)
):
    """Get analytics for a chatbot (total conversations, messages, feedback)"""
    
    # Verify chatbot exists
    chatbot = session.exec(
        select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
    ).first()
    
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Count total conversations
    total_conversations = session.exec(
        select(func.count(Conversation.uuid))
        .where(Conversation.chatbot_uuid == chatbot_uuid)
    ).one()
    
    # Get all conversation UUIDs for this chatbot
    conversation_uuids = session.exec(
        select(Conversation.uuid)
        .where(Conversation.chatbot_uuid == chatbot_uuid)
    ).all()
    
    # Count total messages (all messages in conversations for this chatbot)
    if conversation_uuids:
        total_messages = session.exec(
            select(func.count(Message.id))
            .where(Message.conversation_uuid.in_(conversation_uuids))
        ).one()
        
        # Count thumbs up (likes)
        total_thumbs_up = session.exec(
            select(func.count(Message.id))
            .where(
                Message.conversation_uuid.in_(conversation_uuids),
                Message.feedback == "like"
            )
        ).one()
        
        # Count thumbs down (dislikes)
        total_thumbs_down = session.exec(
            select(func.count(Message.id))
            .where(
                Message.conversation_uuid.in_(conversation_uuids),
                Message.feedback == "dislike"
            )
        ).one()
    else:
        total_messages = 0
        total_thumbs_up = 0
        total_thumbs_down = 0
    
    return {
        "total_conversations": total_conversations or 0,
        "total_messages": total_messages or 0,
        "total_thumbs_up": total_thumbs_up or 0,
        "total_thumbs_down": total_thumbs_down or 0,
    }
