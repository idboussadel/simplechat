from typing import TypedDict, Annotated, Sequence, Callable, Awaitable
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from pinecone import Pinecone
from sqlmodel import Session, select
from app.models import Chatbot, Conversation, Message, User
from app.services.credits_service import credits_service
from app.services.conversation_details_service import conversation_details_service
from datetime import datetime
from pydantic import BaseModel, Field
import os
import json
import re
from app.celery_app import celery_app
from starlette.concurrency import run_in_threadpool


class ChatState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "The messages in the conversation"]
    context: str
    chatbot_config: dict
    should_offer_handoff: bool


class ChatResponse(BaseModel):
    """Structured response from the AI including whether to offer handoff"""
    response: str = Field(description="The AI's response to the user's question")
    should_offer_handoff: bool = Field(description="Whether to offer connecting the user with customer service. ONLY set to true if you are 100% certain that you cannot answer the question at all - meaning the context is completely empty, completely irrelevant, or the question is clearly about something that doesn't exist in your knowledge base. If you can provide ANY answer, even if partial or uncertain, set this to false. Customer service should be the absolute last resort.")


class ChatService:
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.pinecone_api_key = os.getenv("PINECONE_API_KEY")
        self.pinecone_index_name = os.getenv("PINECONE_INDEX_NAME", "test")
        
        # Initialize Pinecone
        self.pc = Pinecone(api_key=self.pinecone_api_key)
        self.index = self.pc.Index(self.pinecone_index_name)
        
        # Initialize embeddings
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            dimensions=1024,
            openai_api_key=self.openai_api_key
        )
    
    async def _user_explicitly_requests_handoff(self, user_message: str) -> bool:
        """Check if user explicitly requests customer service/handoff using AI (language-agnostic)"""
        try:
            if not self.openai_api_key:
                return False
            
            class HandoffRequestResponse(BaseModel):
                requests_handoff: bool = Field(description="Whether the user is explicitly requesting to speak with a human/customer service representative")
            
            llm = ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0,
                openai_api_key=self.openai_api_key
            )
            structured_llm = llm.with_structured_output(HandoffRequestResponse)
            
            prompt = f"""Analyze the following user message and determine if they are EXPLICITLY requesting to speak with a human, customer service representative, or agent.

User message: "{user_message}"

Return requests_handoff=true ONLY if the user is clearly and explicitly asking to:
- Speak with a human/person/agent/representative
- Connect with customer service/support
- Transfer to a real person
- Get help from a human agent

Return requests_handoff=false if:
- The user is just asking a question
- The user is expressing frustration but not explicitly requesting human help
- The user is making a general inquiry
- You are uncertain

Be strict - only return true for explicit requests, not implied ones."""
            
            # Use async call so we don't block the event loop
            response = await structured_llm.ainvoke(prompt)
            return response.requests_handoff
            
        except Exception as e:
            print(f"[ChatService] Error detecting explicit handoff request: {e}")
            return False
    
    async def _retrieve_context(self, state: ChatState) -> ChatState:
        """Retrieve relevant context from Pinecone using RAG"""
        chatbot_uuid = state["chatbot_config"]["uuid"]
        user_query = state["messages"][-1].content
        
        # Get vector store for this specific chatbot
        vector_store = PineconeVectorStore(
            index=self.index,
            embedding=self.embeddings,
            namespace=chatbot_uuid
        )
        
        # Retrieve relevant documents.
        # Pinecone / LangChain vector stores are synchronous, so run in a thread
        docs = await run_in_threadpool(
            vector_store.similarity_search,
            user_query,
            k=5,
        )
        
        # Combine retrieved context
        context = "\n\n".join([doc.page_content for doc in docs])
        state["context"] = context
        
        return state
    
    def _build_system_prompt(self, chatbot_config: dict, context: str) -> str:
        """Build the system prompt used for both streaming and non-streaming generation."""
        response_language = chatbot_config["language"]

        # Build language instruction
        if response_language == "Client Language":
            language_instruction = (
                "CRITICAL LANGUAGE REQUIREMENT: You MUST respond in the SAME language as the user's question. "
                "If the user writes in French, respond in French. If the user writes in English, respond in English. "
                "Always match the language of the user's message."
            )
        else:
            language_instruction = (
                f"CRITICAL LANGUAGE REQUIREMENT: You MUST respond ONLY in {response_language}. "
                f"Never switch to another language, even if the user writes in a different language. "
                f"Always maintain your responses strictly in {response_language}. "
                f"This is mandatory - your responses must always be in {response_language} regardless of what language the user uses."
            )

        system_prompt = f"""You are the official AI chatbot representing {chatbot_config['name']}. You ARE {chatbot_config['name']}'s chatbot, and you speak on behalf of {chatbot_config['name']}.

        IMPORTANT: When users ask questions using "you", "your", "do you", "are you", etc., they are asking about {chatbot_config['name']}, not about yourself as an AI. Always interpret these questions as referring to {chatbot_config['name']} and answer based on the context provided about {chatbot_config['name']}.

        {language_instruction}

        Tone: {chatbot_config['tone']}

        {chatbot_config.get('instructions', '')}

        You MUST answer questions based ONLY on the following context about {chatbot_config['name']}. Do not use general knowledge or make assumptions beyond what is provided in the context. If the context doesn't contain the information, say so clearly.

        Context about {chatbot_config['name']}:
        {context}

        CRITICAL INSTRUCTIONS FOR HANDOFF:
        1. ALWAYS try to answer the user's question first using the provided context, even if the context is limited or you're not 100% certain.
        2. ONLY set should_offer_handoff to true if you are ABSOLUTELY CERTAIN you cannot provide ANY useful answer - meaning:
        - The context is completely empty AND the question is clearly about something specific that requires knowledge you don't have
        - The context is completely irrelevant to the question (e.g., question about "Pack Standard" but context only talks about something completely different)
        - The question asks about something that clearly doesn't exist in your knowledge base (e.g., "What is the price of the non-existent product XYZ?")
        3. DO NOT set should_offer_handoff to true if:
        - You can provide a partial answer
        - You're uncertain but can still provide useful information
        - The context has some relevant information, even if not complete
        - You can make reasonable inferences from the context
        4. Your default should be to answer the question. Only offer customer service as an absolute last resort when you are 100% certain you cannot help at all.

        FORMATTING INSTRUCTIONS:
        - Use markdown formatting for better readability
        - DO NOT use markdown headers (#, ##, ###, ####, etc.) in your responses - headers are not supported in messages
        - When listing items, services, features, or any structured information, use markdown bullet points (starting with "- " or "* ")
        - Use **bold** for emphasis on important terms
        - Use proper line breaks between sections
        - Format lists as markdown bullets, not plain text with dashes
        - You MUST ONLY use information that is explicitly provided in the context below
        
        Example of good formatting:
        - **Service 1**: Description
        - **Service 2**: Description
        - **Service 3**: Description

        When should_offer_handoff is true, your response should naturally offer to connect the user with a customer service representative.
        """
        return system_prompt

    async def _generate_response(self, state: ChatState) -> ChatState:
        """Generate AI response using LLM with context and determine if handoff should be offered"""
        chatbot_config = state["chatbot_config"]
        context = state.get("context", "")

        system_prompt = self._build_system_prompt(chatbot_config, context)
                    
        # Initialize LLM with structured output.
        # ChatOpenAI provides async methods that do not block the event loop.
        llm = ChatOpenAI(
            model=chatbot_config['model_name'],
            temperature=0.7,
            openai_api_key=self.openai_api_key,
        )
        structured_llm = llm.with_structured_output(ChatResponse)
        
        # Prepare messages with system prompt
        messages = [HumanMessage(content=system_prompt)] + list(state["messages"])
        
        # Generate structured response
        try:
            # Use async structured output to avoid blocking
            structured_response = await structured_llm.ainvoke(messages)
            ai_response = structured_response.response
            should_offer_handoff = structured_response.should_offer_handoff
            
            print(f"Response: {ai_response}")
            print(f"Should offer handoff: {should_offer_handoff}")
            
            # If handoff should be offered but response doesn't mention it, add it
            if should_offer_handoff and "customer service" not in ai_response.lower() and "representative" not in ai_response.lower():
                ai_response += "\n\nWould you like me to connect you with a customer service representative who can help you better?"
            
        # Add AI response to messages
            state["messages"].append(AIMessage(content=ai_response))
            state["should_offer_handoff"] = should_offer_handoff
            
        except Exception as e:
            print(f"Error with structured output, falling back to regular response: {e}")
            # Fallback to regular response (also async)
            response = await llm.ainvoke(messages)
            ai_response = response.content
            state["messages"].append(AIMessage(content=ai_response))
            # Use very conservative context-based detection as fallback - only offer handoff if context is completely empty
            state["should_offer_handoff"] = not context or len(context.strip()) == 0
        
        return state
    
    
    def create_chat_graph(self):
        """Create LangGraph workflow for chat"""
        workflow = StateGraph(ChatState)
        
        # Add nodes
        workflow.add_node("retrieve", self._retrieve_context)
        workflow.add_node("generate", self._generate_response)
        
        # Add edges
        workflow.set_entry_point("retrieve")
        workflow.add_edge("retrieve", "generate")
        workflow.add_edge("generate", END)
        
        return workflow.compile()

    def _prepare_chat_run(
        self,
        chatbot_uuid: str,
        conversation_uuid: str,
        user_message: str,
        session: Session,
    ):
        """Common synchronous preparation for processing or streaming a chat message."""
        # Get chatbot configuration
        chatbot = session.exec(
            select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
        ).first()
        if not chatbot:
            raise ValueError("Chatbot not found")

        # Check and deduct workspace credits (not user credits)
        if not credits_service.has_credits_for_chatbot(chatbot_uuid, session):
            raise ValueError(
                "No message credits remaining. Your workspace has reached its monthly limit. Please upgrade your plan."
            )

        # Deduct credit for this message from workspace
        credits_service.deduct_credit_for_chatbot(chatbot_uuid, session, amount=1)

        # Get conversation
        conversation = session.exec(
            select(Conversation).where(Conversation.uuid == conversation_uuid)
        ).first()
        if not conversation:
            raise ValueError("Conversation not found")

        # Get conversation history (last 10 messages for context)
        history_messages = session.exec(
            select(Message)
            .where(Message.conversation_uuid == conversation_uuid)
            .order_by(Message.created_at.desc())
            .limit(10)
        ).all()

        # Convert to LangChain messages (reverse to chronological order)
        lc_messages = []
        for msg in reversed(history_messages):
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=msg.content))
            else:
                lc_messages.append(AIMessage(content=msg.content))

        # Add new user message
        lc_messages.append(HumanMessage(content=user_message))

        # Save user message to database
        user_msg = Message(
            conversation_uuid=conversation_uuid,
            role="user",
            content=user_message,
        )
        session.add(user_msg)
        session.commit()

        # Classify user message topic asynchronously (does not block response)
        try:
            celery_app.send_task(
                "app.tasks.classify_message_topic",
                args=[user_msg.id, chatbot_uuid, "user", user_message],
            )
        except Exception as e:
            # Never fail the request because of analytics
            print(
                f"[ChatService] Failed to enqueue topic classification for user message {user_msg.id}: {e}"
            )

        # Extract and update conversation details (only if fields are empty)
        conversation_details_service.update_conversation_details(
            conversation=conversation,
            message_text=user_message,
            session=session,
        )

        # Prepare chatbot config
        chatbot_config = {
            "uuid": chatbot.uuid,
            "name": chatbot.name,
            "language": chatbot.language,
            "tone": chatbot.tone,
            "instructions": chatbot.instructions,
            "model_name": chatbot.model_name,
        }

        return chatbot, conversation, lc_messages, chatbot_config
    
    async def process_message(
        self,
        chatbot_uuid: str,
        conversation_uuid: str,
        user_message: str,
        session: Session
    ) -> str:
        """Process a user message and return AI response (non-streaming).

        Used by the REST endpoint. For streaming over WebSocket, use `stream_message`.
        """

        chatbot, conversation, lc_messages, chatbot_config = self._prepare_chat_run(
            chatbot_uuid=chatbot_uuid,
            conversation_uuid=conversation_uuid,
            user_message=user_message,
            session=session,
        )
        
        # Check if user explicitly requests handoff
        user_explicitly_requests_handoff = await self._user_explicitly_requests_handoff(user_message)
        
        # Create initial state
        initial_state = {
            "messages": lc_messages,
            "context": "",
            "chatbot_config": chatbot_config,
            "should_offer_handoff": False
        }
        
        # Run LangGraph workflow asynchronously so it doesn't block other requests.
        graph = self.create_chat_graph()
        result = await graph.ainvoke(initial_state)
        
        # Extract AI response and handoff flag
        ai_response = result["messages"][-1].content
        should_offer_handoff = result.get("should_offer_handoff", False)
        
        # Override handoff flag if user explicitly requests it
        if user_explicitly_requests_handoff:
            should_offer_handoff = True
            print(f"[ChatService] User explicitly requested handoff: {user_message}")
            # Update AI response to acknowledge the request
            if "customer service" not in ai_response.lower() and "representative" not in ai_response.lower():
                ai_response = "I understand you'd like to speak with a customer service representative. Let me connect you with someone who can help you better."
        
        # Save AI response to database
        ai_msg = Message(
            conversation_uuid=conversation_uuid,
            role="assistant",
            content=ai_response
        )
        session.add(ai_msg)
        
        # If handoff should be offered (either by AI or user request), create handoff request
        if should_offer_handoff:
            from app.services.handoff_service import handoff_service
            try:
                reason = "User explicitly requested customer service" if user_explicitly_requests_handoff else "AI determined handoff is needed"
                print(f"[ChatService] {'User' if user_explicitly_requests_handoff else 'AI'} decided to offer handoff for conversation {conversation_uuid}")
                handoff_request = handoff_service.create_handoff_request(
                    conversation_uuid=conversation_uuid,
                    chatbot_uuid=chatbot_uuid,
                    reason=reason,
                    session=session
                )
                print(f"[ChatService] ✅ Handoff request created: {handoff_request.id}")
            except Exception as e:
                print(f"[ChatService] ❌ Error creating handoff request: {e}")
                import traceback
                traceback.print_exc()
        
        # Update conversation timestamp
        conversation.updated_at = datetime.utcnow()
        session.add(conversation)
        
        session.commit()
        
        return ai_response

    async def stream_message(
        self,
        chatbot_uuid: str,
        conversation_uuid: str,
        user_message: str,
        session: Session,
        on_chunk: Callable[[str], Awaitable[None]],
    ) -> str:
        """Process a user message and stream the AI response incrementally.

        - Uses the same RAG + prompt construction as `process_message`
        - Streams tokens to `on_chunk` callback as they arrive
        - Persists the full assistant message at the end
        """
        _, conversation, lc_messages, chatbot_config = self._prepare_chat_run(
            chatbot_uuid=chatbot_uuid,
            conversation_uuid=conversation_uuid,
            user_message=user_message,
            session=session,
        )

        # Retrieve context first (RAG)
        initial_state: ChatState = {
            "messages": lc_messages,
            "context": "",
            "chatbot_config": chatbot_config,
            "should_offer_handoff": False,
        }
        state_with_context = await self._retrieve_context(initial_state)
        context = state_with_context.get("context", "")

        system_prompt = self._build_system_prompt(chatbot_config, context)

        # Initialize LLM for streaming (no structured output here; we just stream text)
        llm = ChatOpenAI(
            model=chatbot_config["model_name"],
            temperature=0.7,
            openai_api_key=self.openai_api_key,
        )

        messages = [HumanMessage(content=system_prompt)] + list(lc_messages)

        full_response = ""

        async for chunk in llm.astream(messages):
            # LangChain ChatOpenAI streaming yields chunks with `.content`
            delta = getattr(chunk, "content", None) or ""
            if not delta:
                continue

            full_response += delta
            # Send incremental chunk to the caller (e.g., WebSocket)
            await on_chunk(delta)

        # After streaming completes, persist the assistant message
        ai_msg = Message(
            conversation_uuid=conversation_uuid,
            role="assistant",
            content=full_response,
        )
        session.add(ai_msg)

        # Update conversation timestamp
        conversation.updated_at = datetime.utcnow()
        session.add(conversation)

        session.commit()

        return full_response
    
    def create_conversation(
        self,
        chatbot_uuid: str,
        session_id: str,
        client_uuid: str = None,
        customer_name: str = None,
        customer_email: str = None,
        session: Session = None
    ) -> Conversation:
        """Create a new conversation"""
        conversation = Conversation(
            chatbot_uuid=chatbot_uuid,
            session_id=session_id,
            client_uuid=client_uuid,
            customer_name=customer_name or "Anonymous",
            customer_email=customer_email,
            status="active"
        )
        
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        
        return conversation
    
    def get_or_create_conversation(
        self,
        chatbot_uuid: str,
        session_id: str,
        client_uuid: str = None,
        session: Session = None
    ) -> Conversation:
        """Get existing conversation or create new one. 
        CRITICAL: session_id takes priority - each new session_id should get a new conversation.
        client_uuid is only used for grouping/history, not for finding existing conversations."""
        
        # CRITICAL: Check session_id FIRST - each new session should get a new conversation
        # This ensures "Start new conversation" creates a truly new conversation
        conversation = session.exec(
            select(Conversation)
            .where(Conversation.chatbot_uuid == chatbot_uuid)
            .where(Conversation.session_id == session_id)
            .where(Conversation.status == "active")
        ).first()
        
        # If conversation exists for this session_id, return it (continuing existing conversation)
        if conversation:
            return conversation
        
        # If no conversation found for this session_id, create a NEW conversation
        # This happens when:
        # 1. User starts a new conversation (new session_id)
        # 2. User loads an old conversation (different session_id)
        conversation = self.create_conversation(
            chatbot_uuid=chatbot_uuid,
            session_id=session_id,
            client_uuid=client_uuid,
            session=session
        )
        
        return conversation
