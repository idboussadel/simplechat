import os
import logging
from typing import BinaryIO
from fastapi import UploadFile, HTTPException, status
from sqlmodel import Session, select
from app.models import Document, Chatbot, User
from app.services.pinecone_service import PineconeService
from app.services.file_processor import FileProcessor

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.csv'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

class DocumentService:
    
    @staticmethod
    async def upload_document(
        chatbot_uuid: str,
        file: UploadFile,
        user_uuid: str,
        session: Session
    ) -> Document:
        """Upload and process a document for a specific chatbot"""
        
        # Verify chatbot ownership
        chatbot = session.get(Chatbot, chatbot_uuid)
        if not chatbot:
            raise HTTPException(status_code=404, detail="Chatbot not found")
        
        # Verify workspace access (allows workspace members)
        from app.services.workspace_service import workspace_service
        user = session.get(User, user_uuid)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        try:
            workspace_service.check_workspace_access(chatbot.workspace_uuid, user, session)
        except HTTPException:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Validate file
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max size: {MAX_FILE_SIZE / 1024 / 1024}MB"
            )
        
        # Create document record
        document = Document(
            chatbot_uuid=chatbot_uuid,
            filename=file.filename,
            file_path="",  # Will be set after upload
            file_type=file_ext[1:],  # Remove dot
            file_size=file_size,
            status="processing"
        )
        
        try:
            # Save file
            file_path = DocumentService._save_file(chatbot_uuid, file.filename, content)
            document.file_path = file_path
            
            session.add(document)
            session.commit()
            session.refresh(document)
            
            # Queue document processing task
            from app.tasks import process_document_task
            task = process_document_task.delay(document.id, chatbot_uuid, user_uuid)
            
            logger.info(f"Queued document processing task {task.id} for document {document.id}")
            
            return document
            
        except Exception as e:
            logger.error(f"Failed to upload document: {str(e)}")
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")
    
    @staticmethod
    def _save_file(chatbot_uuid: str, filename: str, content: bytes) -> str:
        """Save file to local storage"""
        upload_dir = f"uploads/chatbots/{chatbot_uuid}/documents"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = f"{upload_dir}/{filename}"
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        return file_path
    
    @staticmethod
    def _process_document(document: Document, chatbot: Chatbot, session: Session):
        """Process document: extract text, chunk, vectorize, store in Pinecone"""
        try:
            # Extract text from file
            text = FileProcessor.extract_text(document.file_path, document.file_type)
            
            # Chunk text
            chunks = FileProcessor.chunk_text(text, chunk_size=500, overlap=50)
            
            # Store in Pinecone with chatbot isolation
            pinecone_service = PineconeService()
            pinecone_service.upsert_chunks(
                chunks=chunks,
                chatbot_uuid=chatbot.uuid,  # Use chatbot UUID as namespace
                document_id=document.id
            )
            
            # Update document status
            document.chunk_count = len(chunks)
            document.status = "completed"
            session.add(document)
            session.commit()
            
        except Exception as e:
            logger.error(f"Failed to process document {document.id}: {str(e)}")
            document.status = "failed"
            document.error_message = str(e)
            session.add(document)
            session.commit()
    
    @staticmethod
    def get_chatbot_documents(chatbot_uuid: str, user_uuid: str, session: Session):
        """Get all documents for a chatbot"""
        chatbot = session.get(Chatbot, chatbot_uuid)
        if not chatbot or chatbot.user_uuid != user_uuid:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        documents = session.exec(
            select(Document).where(Document.chatbot_uuid == chatbot_uuid)
        ).all()
        
        return documents
    
    @staticmethod
    def get_document(chatbot_uuid: str, document_id: int, user_uuid: str, session: Session):
        """Get a single document with its extracted text reconstructed from chunks"""
        chatbot = session.get(Chatbot, chatbot_uuid)
        if not chatbot or chatbot.user_uuid != user_uuid:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        document = session.get(Document, document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if document.chatbot_uuid != chatbot_uuid:
            raise HTTPException(status_code=403, detail="Document does not belong to this chatbot")
        
        # Reconstruct text from Pinecone chunks
        extracted_text = ""
        try:
            pinecone_service = PineconeService()
            
            # Fetch vectors by ID prefix (more reliable than filtering)
            # IDs are in format: doc_{document_id}_chunk_{idx}
            fetch_result = pinecone_service.index.fetch(
                ids=[f"doc_{document_id}_chunk_{i}" for i in range(document.chunk_count or 1000)],
                namespace=chatbot_uuid
            )
            
            if fetch_result and fetch_result.vectors:
                # Sort chunks by their index to maintain order
                chunks_dict = {}
                for vector_id, vector_data in fetch_result.vectors.items():
                    chunk_index = vector_data.metadata.get("chunk_index", 0)
                    chunk_text = vector_data.metadata.get("text", "")
                    chunks_dict[chunk_index] = chunk_text
                
                # Sort by index and concatenate
                sorted_indices = sorted(chunks_dict.keys())
                chunk_texts = [chunks_dict[idx] for idx in sorted_indices]
                extracted_text = "\n\n".join(chunk_texts)
            else:
                extracted_text = "No content available. The document may still be processing."
                
        except Exception as e:
            logger.error(f"Failed to fetch chunks for document {document_id}: {str(e)}")
            extracted_text = "Failed to retrieve document content"
        
        # Return document with extracted text
        return {
            "id": document.id,
            "chatbot_uuid": document.chatbot_uuid,
            "filename": document.filename,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "status": document.status,
            "chunk_count": document.chunk_count,
            "created_at": document.created_at.isoformat() if document.created_at else None,
            "extracted_text": extracted_text
        }
    
    @staticmethod
    def delete_document(chatbot_uuid: str, document_id: int, user_uuid: str, session: Session):
        """Delete document and its vectors from Pinecone"""
        document = session.get(Document, document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if document.chatbot_uuid != chatbot_uuid:
            raise HTTPException(status_code=403, detail="Document does not belong to this chatbot")
        
        chatbot = session.get(Chatbot, chatbot_uuid)
        # Verify workspace access (allows workspace members)
        from app.services.workspace_service import workspace_service
        user = session.get(User, user_uuid)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        try:
            workspace_service.check_workspace_access(chatbot.workspace_uuid, user, session)
        except HTTPException:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        try:
            # Delete from Pinecone
            pinecone_service = PineconeService()
            pinecone_service.delete_document_vectors(
                document_id=document.id,
                chatbot_uuid=chatbot.uuid
            )
            
            # Delete file from storage
            if os.path.exists(document.file_path):
                os.remove(document.file_path)
            
            # Delete from DB
            session.delete(document)
            session.commit()
            
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to delete document")


async def process_document_content(
    content: str,
    chatbot_uuid: str,
    source_type: str,
    source_id: str,
    session: Session
) -> int:
    """Process text content (from website, text input, etc.) and store in Pinecone.
    
    Args:
        content: Raw text content to process
        chatbot_uuid: UUID of the chatbot
        source_type: Type of source ('website', 'text', etc.)
        source_id: ID of the source record
        session: Database session
        
    Returns:
        Number of chunks created
    """
    try:
        # Chunk text
        chunks = FileProcessor.chunk_text(content, chunk_size=500, overlap=50)
        
        if not chunks:
            logger.warning(f"No chunks created for {source_type} {source_id}")
            return 0
        
        # Store in Pinecone with chatbot isolation
        pinecone_service = PineconeService()
        
        # Use source_type and source_id to create unique vector IDs
        vectors = []
        for idx, chunk in enumerate(chunks):
            try:
                embedding = pinecone_service.get_embedding(chunk)
                vectors.append({
                    "id": f"{source_type}_{source_id}_chunk_{idx}",
                    "values": embedding,
                    "metadata": {
                        "source_type": source_type,
                        "source_id": source_id,
                        "chunk_index": idx,
                        "text": chunk  # Store full chunk text (Pinecone allows up to 40KB metadata per vector)
                    }
                })
            except Exception as e:
                logger.error(f"Failed to process chunk {idx} for {source_type} {source_id}: {str(e)}")
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
        
        logger.info(f"Successfully processed {len(chunks)} chunks for {source_type} {source_id}")
        return len(chunks)
        
    except Exception as e:
        logger.error(f"Failed to process content for {source_type} {source_id}: {str(e)}")
        raise