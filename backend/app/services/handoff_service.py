from datetime import datetime
from typing import Optional
from sqlmodel import Session, select
from app.models import HandoffRequest, Conversation, Chatbot, User, Message


class HandoffService:
    """Service for managing customer service handoff requests"""
    
    def create_handoff_request(
        self,
        conversation_uuid: str,
        chatbot_uuid: str,
        reason: Optional[str] = None,
        session: Session = None
    ) -> HandoffRequest:
        """Create a new handoff request"""
        # Check if request already exists
        existing = session.exec(
            select(HandoffRequest)
            .where(HandoffRequest.conversation_uuid == conversation_uuid)
            .where(HandoffRequest.status == "pending")
        ).first()
        
        if existing:
            return existing
        
        handoff_request = HandoffRequest(
            conversation_uuid=conversation_uuid,
            chatbot_uuid=chatbot_uuid,
            status="pending",
            reason=reason
        )
        
        # Update conversation handoff status
        conversation = session.exec(
            select(Conversation).where(Conversation.uuid == conversation_uuid)
        ).first()
        
        if conversation:
            conversation.handoff_status = "requested"
            session.add(conversation)
        
        session.add(handoff_request)
        session.commit()
        session.refresh(handoff_request)
        
        return handoff_request
    
    def accept_handoff_request(
        self,
        handoff_request_id: int,
        user_uuid: str,
        session: Session
    ) -> HandoffRequest:
        """Accept a handoff request and assign to user"""
        handoff_request = session.exec(
            select(HandoffRequest).where(HandoffRequest.id == handoff_request_id)
        ).first()
        
        if not handoff_request:
            raise ValueError("Handoff request not found")
        
        if handoff_request.status != "pending":
            raise ValueError(f"Handoff request is already {handoff_request.status}")
        
        # Update handoff request
        handoff_request.status = "accepted"
        handoff_request.accepted_at = datetime.utcnow()
        handoff_request.accepted_by_user_uuid = user_uuid
        
        # Update conversation
        conversation = session.exec(
            select(Conversation).where(Conversation.uuid == handoff_request.conversation_uuid)
        ).first()
        
        if conversation:
            conversation.handoff_status = "human"
            conversation.assigned_to_user_uuid = user_uuid
            session.add(conversation)
        
        session.add(handoff_request)
        session.commit()
        session.refresh(handoff_request)
        
        return handoff_request
    
    def get_pending_handoff_requests(
        self,
        chatbot_uuid: str,
        session: Session
    ) -> list[HandoffRequest]:
        """Get all pending handoff requests for a chatbot"""
        requests = session.exec(
            select(HandoffRequest)
            .where(HandoffRequest.chatbot_uuid == chatbot_uuid)
            .where(HandoffRequest.status == "pending")
            .order_by(HandoffRequest.requested_at.desc())
        ).all()
        
        return list(requests)
    
    def get_handoff_request_by_conversation(
        self,
        conversation_uuid: str,
        session: Session
    ) -> Optional[HandoffRequest]:
        """Get handoff request for a conversation"""
        return session.exec(
            select(HandoffRequest)
            .where(HandoffRequest.conversation_uuid == conversation_uuid)
            .order_by(HandoffRequest.requested_at.desc())
        ).first()
    
    def send_agent_message(
        self,
        conversation_uuid: str,
        agent_user_uuid: str,
        content: str,
        session: Session
    ) -> Message:
        """Send a message from an agent (human) to the customer"""
        # Verify conversation is assigned to this agent
        conversation = session.exec(
            select(Conversation).where(Conversation.uuid == conversation_uuid)
        ).first()
        
        if not conversation:
            raise ValueError("Conversation not found")
        
        if conversation.handoff_status != "human":
            raise ValueError("Conversation is not in human handoff mode")
        
        if conversation.assigned_to_user_uuid != agent_user_uuid:
            raise ValueError("You are not assigned to this conversation")
        
        # Create agent message
        message = Message(
            conversation_uuid=conversation_uuid,
            role="agent",
            content=content
        )
        
        conversation.updated_at = datetime.utcnow()
        session.add(conversation)
        session.add(message)
        session.commit()
        session.refresh(message)
        
        return message


handoff_service = HandoffService()

