import os
from typing import List, Dict
from pinecone import Pinecone, ServerlessSpec
import openai
import logging

logger = logging.getLogger(__name__)


class PineconeService:
    """Service for managing Pinecone vector operations with chatbot isolation"""
    
    def __init__(self):
        pinecone_key = os.getenv("PINECONE_API_KEY")
        if not pinecone_key:
            raise ValueError("PINECONE_API_KEY environment variable must be set")
        
        self.pc = Pinecone(api_key=pinecone_key)
        self.index_name = os.getenv("PINECONE_INDEX_NAME", "chatbot-documents")
        
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("OPENAI_API_KEY environment variable must be set")
        
        self.openai_client = openai.OpenAI(api_key=openai_key)
        
        # Create index if doesn't exist
        self._ensure_index_exists()
        
        self.index = self.pc.Index(self.index_name)
    
    def _ensure_index_exists(self):
        """Create Pinecone index if it doesn't exist"""
        try:
            existing_indexes = [idx.name for idx in self.pc.list_indexes()]
            
            if self.index_name not in existing_indexes:
                logger.info(f"Creating Pinecone index: {self.index_name}")
                self.pc.create_index(
                    name=self.index_name,
                    dimension=1024,  # text-embedding-3-small with dimension 1024
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud=os.getenv("PINECONE_CLOUD", "aws"),
                        region=os.getenv("PINECONE_REGION", "us-east-1")
                    )
                )
        except Exception as e:
            logger.error(f"Failed to ensure index exists: {str(e)}")
            raise
    
    def get_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI text-embedding-3-small with 1024 dimensions"""
        try:
            response = self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                dimensions=1024,  # Explicitly set to 1024 to match your Pinecone index
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to generate embedding: {str(e)}")
            raise
    
    def upsert_chunks(
        self,
        chunks: List[str],
        chatbot_uuid: str,
        document_id: int
    ):
        """
        Store document chunks in Pinecone using chatbot UUID as namespace.
        Perfect isolation - each chatbot has its own namespace.
        """
        vectors = []
        
        for idx, chunk in enumerate(chunks):
            try:
                embedding = self.get_embedding(chunk)
                
                vectors.append({
                    "id": f"doc_{document_id}_chunk_{idx}",
                    "values": embedding,
                    "metadata": {
                        "document_id": document_id,
                        "chunk_index": idx,
                        "text": chunk  # Store full chunk text (Pinecone allows up to 40KB metadata per vector)
                    }
                })
            except Exception as e:
                logger.error(f"Failed to process chunk {idx} for doc {document_id}: {str(e)}")
                continue
        
        if not vectors:
            raise ValueError("No vectors to upsert")
        
        # Upsert in batches of 100
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            try:
                self.index.upsert(vectors=batch, namespace=chatbot_uuid)
                logger.info(f"Upserted {len(batch)} vectors to namespace {chatbot_uuid}")
            except Exception as e:
                logger.error(f"Failed to upsert batch to Pinecone: {str(e)}")
                raise
    
    def query_chatbot_context(
        self,
        query: str,
        chatbot_uuid: str,
        top_k: int = 5
    ) -> List[Dict]:
        """
        Query vectors using chatbot UUID as namespace.
        Perfect isolation - can only access this chatbot's data.
        """
        try:
            query_embedding = self.get_embedding(query)
            
            results = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                namespace=chatbot_uuid,  # Namespace provides complete isolation
                include_metadata=True
            )
            
            return [
                {
                    "text": match.metadata.get("text", ""),
                    "score": match.score,
                    "document_id": match.metadata.get("document_id"),
                    "chunk_index": match.metadata.get("chunk_index")
                }
                for match in results.matches
            ]
        except Exception as e:
            logger.error(f"Failed to query Pinecone: {str(e)}")
            raise
    
    def delete_document_vectors(self, document_id: int, chatbot_uuid: str):
        """Delete all vectors for a specific document"""
        try:
            self.index.delete(
                filter={"document_id": document_id},
                namespace=chatbot_uuid
            )
            logger.info(f"Deleted vectors for document {document_id} in namespace {chatbot_uuid}")
        except Exception as e:
            logger.error(f"Failed to delete document vectors: {str(e)}")
            raise
    
    def delete_source_vectors(self, source_type: str, source_id: str, chatbot_uuid: str):
        """Delete all vectors for a specific source (e.g., website link)"""
        try:
            self.index.delete(
                filter={"source_type": source_type, "source_id": source_id},
                namespace=chatbot_uuid
            )
            logger.info(f"Deleted vectors for {source_type} {source_id} in namespace {chatbot_uuid}")
        except Exception as e:
            logger.error(f"Failed to delete source vectors: {str(e)}")
            raise
    
    def delete_chatbot_namespace(self, chatbot_uuid: str):
        """Delete entire namespace (all documents for a chatbot)"""
        try:
            self.index.delete(delete_all=True, namespace=chatbot_uuid)
            logger.info(f"Deleted entire namespace {chatbot_uuid}")
        except Exception as e:
            logger.error(f"Failed to delete namespace {chatbot_uuid}: {str(e)}")
            raise
