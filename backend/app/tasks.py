"""Celery tasks for background processing."""
import os
import logging
import json
from datetime import datetime
from typing import Optional
from sqlmodel import Session, select
from app.celery_app import celery_app, get_db_session
from app.models import (
    BackgroundTask,
    Document,
    WebsiteLink,
    Chatbot,
    Message,
    TopicStat,
)
from app.services.file_processor import FileProcessor
from app.services.pinecone_service import PineconeService

logger = logging.getLogger(__name__)


def get_db() -> Session:
    """Get a database session."""
    return next(get_db_session())


@celery_app.task(bind=True, name="app.tasks.process_document_task")
def process_document_task(self, document_id: int, chatbot_uuid: str, user_uuid: str):
    """
    Process a document: extract text, chunk, create embeddings, and store in Pinecone.
    
    Args:
        document_id: ID of the document to process
        chatbot_uuid: UUID of the chatbot
        user_uuid: UUID of the user who owns the chatbot
    """
    task_id = self.request.id
    db = get_db()
    
    try:
        # Get or create background task record
        task_record = db.exec(
            select(BackgroundTask).where(BackgroundTask.task_id == task_id)
        ).first()
        
        if not task_record:
            task_record = BackgroundTask(
                task_id=task_id,
                task_type="document_processing",
                status="processing",
                progress=0,
                resource_type="document",
                resource_id=document_id,
                chatbot_uuid=chatbot_uuid,
                user_uuid=user_uuid
            )
            db.add(task_record)
            db.commit()
        
        # Get document
        document = db.get(Document, document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        # Update document status
        document.status = "processing"
        db.add(document)
        db.commit()
        
        # Update task progress
        task_record.status = "processing"
        task_record.progress = 10
        db.add(task_record)
        db.commit()
        
        # Extract text from file (20% progress)
        logger.info(f"Extracting text from document {document_id}")
        text = FileProcessor.extract_text(document.file_path, document.file_type)
        task_record.progress = 30
        db.add(task_record)
        db.commit()
        
        # Chunk text (40% progress)
        logger.info(f"Chunking text for document {document_id}")
        chunks = FileProcessor.chunk_text(text, chunk_size=500, overlap=50)
        task_record.progress = 50
        db.add(task_record)
        db.commit()
        
        # Create embeddings and store in Pinecone (50-90% progress)
        logger.info(f"Creating embeddings for {len(chunks)} chunks")
        pinecone_service = PineconeService()
        
        batch_size = 100
        total_batches = (len(chunks) + batch_size - 1) // batch_size
        
        for batch_idx in range(0, len(chunks), batch_size):
            batch = chunks[batch_idx:batch_idx + batch_size]
            vectors = []
            
            for idx, chunk in enumerate(batch):
                try:
                    embedding = pinecone_service.get_embedding(chunk)
                    global_idx = batch_idx + idx
                    vectors.append({
                        "id": f"doc_{document_id}_chunk_{global_idx}",
                        "values": embedding,
                        "metadata": {
                            "document_id": document_id,
                            "chunk_index": global_idx,
                            "text": chunk
                        }
                    })
                except Exception as e:
                    logger.error(f"Failed to create embedding for chunk {global_idx}: {str(e)}")
                    continue
            
            if vectors:
                pinecone_service.index.upsert(
                    vectors=vectors,
                    namespace=chatbot_uuid
                )
            
            # Update progress
            progress = 50 + int((batch_idx / len(chunks)) * 40)
            task_record.progress = min(progress, 90)
            db.add(task_record)
            db.commit()
        
        # Update document status
        document.chunk_count = len(chunks)
        document.status = "completed"
        db.add(document)
        db.commit()
        
        # Mark task as completed
        task_record.status = "completed"
        task_record.progress = 100
        task_record.completed_at = datetime.utcnow()
        task_record.result_data = json.dumps({
            "chunk_count": len(chunks),
            "document_id": document_id
        })
        db.add(task_record)
        db.commit()
        
        logger.info(f"Successfully processed document {document_id} with {len(chunks)} chunks")
        return {"status": "completed", "chunk_count": len(chunks)}
        
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {str(e)}", exc_info=True)
        
        # Update document status
        try:
            document = db.get(Document, document_id)
            if document:
                document.status = "failed"
                document.error_message = str(e)
                db.add(document)
                db.commit()
        except Exception:
            pass
        
        # Update task status
        try:
            task_record.status = "failed"
            task_record.error_message = str(e)
            task_record.completed_at = datetime.utcnow()
            db.add(task_record)
            db.commit()
        except Exception:
            pass
        
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="app.tasks.crawl_website_task")
def crawl_website_task(self, website_link_id: int, chatbot_uuid: str, user_uuid: str, url: str, crawl_mode: str = "crawl"):
    """
    Crawl a website and process its content.
    
    Args:
        website_link_id: ID of the WebsiteLink record
        chatbot_uuid: UUID of the chatbot
        user_uuid: UUID of the user who owns the chatbot
        url: URL to crawl
        crawl_mode: "crawl" to crawl entire website, "individual" to fetch only the specific URL
    """
    task_id = self.request.id
    db = get_db()
    
    try:
        # Get or create background task record
        task_record = db.exec(
            select(BackgroundTask).where(BackgroundTask.task_id == task_id)
        ).first()
        
        if not task_record:
            task_record = BackgroundTask(
                task_id=task_id,
                task_type="website_crawling",
                status="processing",
                progress=0,
                resource_type="website_link",
                resource_id=website_link_id,
                chatbot_uuid=chatbot_uuid,
                user_uuid=user_uuid
            )
            db.add(task_record)
            db.commit()
        
        # Get website link
        website_link = db.get(WebsiteLink, website_link_id)
        if not website_link:
            raise ValueError(f"WebsiteLink {website_link_id} not found")
        
        # Update website link status
        website_link.status = "crawling"
        db.add(website_link)
        db.commit()
        
        # Update task progress
        task_record.status = "processing"
        task_record.progress = 10
        db.add(task_record)
        db.commit()
        
        # Import crawler
        from app.services.crawler_service import WebCrawler
        
        # Initialize crawler
        crawler = WebCrawler(max_pages=100, timeout=10)
        
        # Crawl based on mode (20-50% progress)
        logger.info(f"Crawling website: {url} (mode: {crawl_mode})")
        if crawl_mode == "individual":
            result = crawler.crawl_page(url)
            if result:
                text_content, title, _ = result
                if len(text_content) > 100:
                    crawled_pages = {url: {'title': title or 'Untitled', 'content': text_content}}
                else:
                    crawled_pages = {}
            else:
                crawled_pages = {}
        else:
            crawled_pages = crawler.crawl_website(url)
        
        task_record.progress = 50
        db.add(task_record)
        db.commit()
        
        if not crawled_pages:
            raise ValueError("No content could be extracted from the website")
        
        # Set title from first page if not set
        if not website_link.title and crawled_pages:
            first_page = next(iter(crawled_pages.values()))
            website_link.title = first_page['title']
        
        # Combine all content into one large text (60% progress)
        combined_content = ""
        for page_url, page_data in crawled_pages.items():
            combined_content += f"\n\n=== {page_data['title']} ===\n"
            combined_content += f"URL: {page_url}\n\n"
            combined_content += page_data['content']
        
        task_record.progress = 70
        db.add(task_record)
        db.commit()
        
        # Process the content (create chunks and embeddings) (70-95% progress)
        # Chunk text
        chunks = FileProcessor.chunk_text(combined_content, chunk_size=500, overlap=50)
        
        if not chunks:
            raise ValueError("No chunks created from website content")
        
        # Store in Pinecone with chatbot isolation
        pinecone_service = PineconeService()
        
        # Use source_type and source_id to create unique vector IDs
        vectors = []
        for idx, chunk in enumerate(chunks):
            try:
                embedding = pinecone_service.get_embedding(chunk)
                vectors.append({
                    "id": f"website_{website_link_id}_chunk_{idx}",
                    "values": embedding,
                    "metadata": {
                        "source_type": "website",
                        "source_id": str(website_link_id),
                        "chunk_index": idx,
                        "text": chunk
                    }
                })
            except Exception as e:
                logger.error(f"Failed to process chunk {idx} for website {website_link_id}: {str(e)}")
                continue
        
        if not vectors:
            raise ValueError("No vectors were created")
        
        # Upsert vectors in batches
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            pinecone_service.index.upsert(
                vectors=batch,
                namespace=chatbot_uuid
            )
        
        chunk_count = len(chunks)
        
        task_record.progress = 95
        db.add(task_record)
        db.commit()
        
        # Update website link status
        website_link.status = "completed"
        website_link.link_count = len(crawled_pages)
        website_link.chunk_count = chunk_count
        website_link.last_crawled_at = datetime.utcnow()
        website_link.error_message = None
        db.add(website_link)
        db.commit()
        
        # Mark task as completed
        task_record.status = "completed"
        task_record.progress = 100
        task_record.completed_at = datetime.utcnow()
        task_record.result_data = json.dumps({
            "link_count": len(crawled_pages),
            "chunk_count": chunk_count,
            "website_link_id": website_link_id
        })
        db.add(task_record)
        db.commit()
        
        logger.info(f"Successfully crawled and processed {len(crawled_pages)} pages from {url}")
        return {"status": "completed", "link_count": len(crawled_pages), "chunk_count": chunk_count}
        
    except Exception as e:
        logger.error(f"Error crawling website {website_link_id}: {str(e)}", exc_info=True)
        
        # Update website link status
        try:
            website_link = db.get(WebsiteLink, website_link_id)
            if website_link:
                website_link.status = "error"
                website_link.error_message = str(e)
                db.add(website_link)
                db.commit()
        except Exception:
            pass
        
        # Update task status
        try:
            task_record.status = "failed"
            task_record.error_message = str(e)
            task_record.completed_at = datetime.utcnow()
            db.add(task_record)
            db.commit()
        except Exception:
            pass
        
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.classify_message_topic")
def classify_message_topic(message_id: int, chatbot_uuid: str, message_role: str, content: str) -> Optional[str]:
    """
    Classify a message into a high-level topic and update aggregates.

    This runs in the background so it never blocks the user-facing chat flow.
    """
    db = get_db()

    try:
        message = db.get(Message, message_id)
        if not message:
            logger.warning(f"[Topic] Message {message_id} not found")
            return None

        # Skip if topic already set (idempotent)
        if message.topic:
            return message.topic

        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            logger.warning("[Topic] OPENAI_API_KEY is not set, skipping topic classification")
            return None

        # Lazy import to avoid Celery worker startup issues if LangChain is missing
        try:
            from langchain_openai import ChatOpenAI
            from pydantic import BaseModel, Field
        except Exception as import_error:  # pragma: no cover - import guard
            logger.error(f"[Topic] Failed to import LangChain/OpenAI: {import_error}")
            return None

        class TopicResponse(BaseModel):
            topic: str = Field(
                description=(
                    "A short, high-level topic name (1-3 words) summarizing the main subject "
                    "of the message, e.g. 'Pricing', 'Onboarding', 'Technical Issue', 'Billing', "
                    "'Account Access', 'Features', 'Bug Report'."
                )
            )

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            openai_api_key=openai_api_key,
        )
        structured_llm = llm.with_structured_output(TopicResponse)

        role_label = "customer" if message_role == "user" else "assistant"
        prompt = f"""
You are a classification assistant.

Classify the following {role_label} message into ONE short, high-level topic that would be useful for analytics.

Message:
\"\"\"{content}\"\"\"

Return only the topic name, not a sentence. It should be 1-3 words.
        """.strip()

        try:
            result = structured_llm.invoke(prompt)
        except Exception as llm_error:
            logger.error(f"[Topic] Error calling OpenAI for message {message_id}: {llm_error}")
            return None

        topic = (result.topic or "").strip()
        if not topic:
            return None

        # Normalize topic for consistency
        topic_normalized = topic[:100]

        # Update message record
        message.topic = topic_normalized
        db.add(message)

        # Update aggregated stats (on-write)
        stat = db.exec(
            select(TopicStat).where(
                TopicStat.chatbot_uuid == chatbot_uuid,
                TopicStat.topic == topic_normalized,
            )
        ).first()

        if not stat:
            stat = TopicStat(
                chatbot_uuid=chatbot_uuid,
                topic=topic_normalized,
                message_count=1,
                updated_at=datetime.utcnow(),
            )
        else:
            stat.message_count += 1
            stat.updated_at = datetime.utcnow()

        db.add(stat)
        db.commit()

        logger.info(
            f"[Topic] Classified message {message_id} for chatbot {chatbot_uuid} "
            f"as topic '{topic_normalized}' (count={stat.message_count})"
        )

        return topic_normalized

    except Exception as e:
        logger.error(f"[Topic] Unexpected error while classifying message {message_id}: {e}", exc_info=True)
        return None
    finally:
        db.close()


@celery_app.task(name="app.tasks.send_workspace_invitation_email")
def send_workspace_invitation_email(
    to_email: str,
    workspace_name: str,
    inviter_name: str,
    email: str,
    password: str,
    login_url: str
):
    """
    Send workspace invitation email with credentials.
    
    Args:
        to_email: Recipient email address
        workspace_name: Name of the workspace
        inviter_name: Name of the user who sent the invitation
        email: Email address for the account (same as to_email)
        password: Generated password for the new account
        login_url: URL to login page
    """
    try:
        from app.services.email_service import email_service
        
        html_content, text_content = email_service.render_workspace_invitation_email(
            workspace_name=workspace_name,
            inviter_name=inviter_name,
            email=email,
            password=password,
            login_url=login_url
        )
        
        success = email_service.send_email(
            to_email=to_email,
            subject=f"Invitation to {workspace_name} workspace",
            html_content=html_content,
            text_content=text_content
        )
        
        if success:
            logger.info(f"Successfully sent invitation email to {to_email}")
        else:
            logger.error(f"Failed to send invitation email to {to_email}")
        
        return {"status": "sent" if success else "failed", "to_email": to_email}
        
    except Exception as e:
        logger.error(f"Error sending invitation email to {to_email}: {str(e)}", exc_info=True)
        raise

