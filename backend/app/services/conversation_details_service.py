import re
import os
from typing import Optional
from sqlmodel import Session
from app.models import Conversation
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


class ConversationDetailsService:
    """Service to extract and update conversation details from messages"""
    
    # Email regex pattern
    EMAIL_PATTERN = re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    )
    
    # Phone regex pattern (supports various formats)
    PHONE_PATTERN = re.compile(
        r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    )
    
    class NameExtractionResponse(BaseModel):
        """Structured response for name extraction"""
        has_name: bool = Field(description="Whether a person's name is mentioned in the message")
        name: Optional[str] = Field(default=None, description="The extracted person's name, or null if no name found")
    
    @staticmethod
    def extract_email(text: str) -> Optional[str]:
        """Extract email address from text"""
        match = ConversationDetailsService.EMAIL_PATTERN.search(text)
        return match.group(0).lower() if match else None
    
    @staticmethod
    def extract_phone(text: str) -> Optional[str]:
        """Extract phone number from text"""
        match = ConversationDetailsService.PHONE_PATTERN.search(text)
        return match.group(0).strip() if match else None
    
    @staticmethod
    def extract_name(text: str) -> Optional[str]:
        """
        Extract person's name from text using AI (language-agnostic).
        Returns the name if found, None otherwise.
        """
        try:
            openai_api_key = os.getenv("OPENAI_API_KEY")
            if not openai_api_key:
                return None
            
            # Use a lightweight model for extraction
            llm = ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0,
                openai_api_key=openai_api_key
            )
            
            # Use structured output for reliable extraction
            structured_llm = llm.with_structured_output(
                ConversationDetailsService.NameExtractionResponse
            )
            
            # Simple prompt that works in any language
            prompt = f"""Analyze the following message and extract the person's name if they are introducing themselves or mentioning their name.

Message: "{text}"

Extract the person's name if they are saying their name, introducing themselves, or mentioning their name in any language. 
Return null if no name is mentioned or if it's unclear what the name is.

Examples:
- "My name is John" → name: "John"
- "Je m'appelle Marie" → name: "Marie"
- "Mi nombre es Carlos" → name: "Carlos"
- "I'm Sarah" → name: "Sarah"
- "Hello, how can I help?" → has_name: false, name: null
"""
            
            response = structured_llm.invoke(prompt)
            
            if response.has_name and response.name:
                # Clean and validate the extracted name
                name = response.name.strip()
                # Remove extra whitespace
                name = " ".join(name.split())
                # Validate it's a reasonable name (2-100 chars, has letters)
                if 2 <= len(name) <= 100 and re.search(r'[A-Za-zÀ-ÿ]', name):
                    return name
            
            return None
            
        except Exception as e:
            # If AI extraction fails, return None (fail silently)
            print(f"[ConversationDetailsService] Name extraction error: {e}")
            return None
    
    @staticmethod
    def update_conversation_details(
        conversation: Conversation,
        message_text: str,
        session: Session
    ) -> bool:
        """
        Extract details from message and update conversation if fields are empty.
        Returns True if any field was updated.
        """
        updated = False
        
        # Extract email (only if not already set)
        if not conversation.customer_email:
            email = ConversationDetailsService.extract_email(message_text)
            if email:
                conversation.customer_email = email
                updated = True
        
        # Extract phone (only if not already set)
        if not conversation.customer_phone:
            phone = ConversationDetailsService.extract_phone(message_text)
            if phone:
                conversation.customer_phone = phone
                updated = True
        
        # Extract name (only if not already set or is "Anonymous")
        if not conversation.customer_name or conversation.customer_name == "Anonymous":
            name = ConversationDetailsService.extract_name(message_text)
            if name:
                conversation.customer_name = name
                updated = True
        
        # Save if updated
        if updated:
            session.add(conversation)
            session.commit()
        
        return updated


conversation_details_service = ConversationDetailsService()

