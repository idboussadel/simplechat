from typing import List
from fastapi import APIRouter, Depends, status, UploadFile, File, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.models import User
from app.schemas import DocumentResponse
from app.auth import get_current_user
from app.services.document_service import DocumentService

router = APIRouter(prefix="/chatbots", tags=["Documents"])


@router.post("/{chatbot_uuid}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    chatbot_uuid: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Upload a document to a chatbot's knowledge base"""
    return await DocumentService.upload_document(chatbot_uuid, file, current_user.uuid, session)


@router.get("/{chatbot_uuid}/documents", response_model=List[DocumentResponse])
def get_chatbot_documents(
    chatbot_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all documents for a specific chatbot"""
    return DocumentService.get_chatbot_documents(chatbot_uuid, current_user.uuid, session)


@router.get("/{chatbot_uuid}/documents/{document_id}")
def get_document(
    chatbot_uuid: str,
    document_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get a single document with its extracted text"""
    return DocumentService.get_document(chatbot_uuid, document_id, current_user.uuid, session)


@router.delete("/{chatbot_uuid}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    chatbot_uuid: str,
    document_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a document from a chatbot's knowledge base"""
    DocumentService.delete_document(chatbot_uuid, document_id, current_user.uuid, session)
    return None
