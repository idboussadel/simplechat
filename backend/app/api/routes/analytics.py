from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, timezone
import os
import numpy as np

from app.database import get_session
from app.models import TopicStat, Chatbot, Message, Conversation
from pydantic import BaseModel


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
  """Compute cosine similarity between two arrays."""
  # Normalize vectors
  a_norm = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-8)
  b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-8)
  # Compute dot product
  return np.dot(a_norm, b_norm.T)


router = APIRouter(prefix="/analytics", tags=["Analytics"])


class TopicItem(BaseModel):
  label: str
  count: int
  percentage: float


class ChatbotTopicsResponse(BaseModel):
  chatbot_uuid: str
  topics: List[TopicItem]
  total_messages: int
  updated_at: datetime


@router.get("/chatbots/{chatbot_uuid}/topics", response_model=ChatbotTopicsResponse)
def get_chatbot_topics(
  chatbot_uuid: str,
  session: Session = Depends(get_session),
):
  """Return aggregated topic analytics for a chatbot."""

  # Ensure chatbot exists
  chatbot = session.exec(
    select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
  ).first()
  if not chatbot:
    raise HTTPException(status_code=404, detail="Chatbot not found")

  stats = session.exec(
    select(TopicStat).where(TopicStat.chatbot_uuid == chatbot_uuid)
  ).all()

  if not stats:
    return ChatbotTopicsResponse(
      chatbot_uuid=chatbot_uuid,
      topics=[],
      total_messages=0,
      updated_at=datetime.now(timezone.utc),
    )

  total = sum(s.message_count for s in stats)
  if total == 0:
    topics: List[TopicItem] = []
  else:
    topics = [
      TopicItem(
        label=s.topic,
        count=s.message_count,
        percentage=round((s.message_count / total) * 100, 2),
      )
      for s in sorted(stats, key=lambda x: x.message_count, reverse=True)
    ]

  latest_updated_at = max(s.updated_at for s in stats if s.updated_at)

  return ChatbotTopicsResponse(
    chatbot_uuid=chatbot_uuid,
    topics=topics,
    total_messages=total,
    updated_at=latest_updated_at or datetime.now(timezone.utc),
  )


class QuestionGroup(BaseModel):
  canonical_question: str  # The representative question
  variations: List[str]  # All similar questions
  count: int  # Total count of all variations


class TopicQuestionsResponse(BaseModel):
  topic: str
  question_groups: List[QuestionGroup]
  total_questions: int


def _get_embeddings_for_texts(texts: List[str]) -> List[List[float]]:
  """Get embeddings for a list of texts using OpenAI."""
  try:
    from langchain_openai import OpenAIEmbeddings
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
      raise ValueError("OPENAI_API_KEY not set")
    
    embeddings_model = OpenAIEmbeddings(
      model="text-embedding-3-small",
      dimensions=1024,
      openai_api_key=openai_api_key
    )
    
    # Get embeddings for all texts
    embeddings = embeddings_model.embed_documents(texts)
    return embeddings
  except Exception as e:
    print(f"[Analytics] Error getting embeddings: {e}")
    raise


def _group_similar_questions(questions: List[str], similarity_threshold: float = 0.85) -> List[QuestionGroup]:
  """
  Group similar questions using semantic similarity.
  
  Args:
    questions: List of question strings
    similarity_threshold: Minimum cosine similarity to consider questions as similar (0-1)
  
  Returns:
    List of QuestionGroup objects with canonical questions and variations
  """
  if not questions:
    return []
  
  # Normalize questions (lowercase, strip)
  normalized = [q.lower().strip() for q in questions]
  
  # Get embeddings
  try:
    embeddings = _get_embeddings_for_texts(normalized)
  except Exception as e:
    print(f"[Analytics] Failed to get embeddings, using simple grouping: {e}")
    # Fallback: group by exact match
    question_counts = {}
    for q in normalized:
      question_counts[q] = question_counts.get(q, 0) + 1
    
    return [
      QuestionGroup(
        canonical_question=q,
        variations=[q],
        count=count
      )
      for q, count in question_counts.items()
    ]
  
  # Convert to numpy array for efficient computation
  embeddings_array = np.array(embeddings)
  
  # Group similar questions
  groups: List[QuestionGroup] = []
  used_indices = set()
  
  for i, question in enumerate(normalized):
    if i in used_indices:
      continue
    
    # Find all similar questions using cosine similarity
    current_embedding = embeddings_array[i:i+1]
    similarities = _cosine_similarity(current_embedding, embeddings_array)[0]
    
    # Find indices of similar questions
    similar_indices = [
      idx for idx, sim in enumerate(similarities)
      if sim >= similarity_threshold and idx not in used_indices
    ]
    
    # Get the original questions (not normalized) for this group
    group_questions = [questions[idx] for idx in similar_indices]
    
    # Use the shortest question as canonical (usually the clearest)
    canonical = min(group_questions, key=len)
    
    # Remove canonical from variations
    variations = [q for q in group_questions if q != canonical]
    if not variations:
      variations = [canonical]  # If only one, still include it
    
    groups.append(QuestionGroup(
      canonical_question=canonical,
      variations=variations,
      count=len(group_questions)
    ))
    
    # Mark all as used
    used_indices.update(similar_indices)
  
  # Sort by count (descending)
  groups.sort(key=lambda g: g.count, reverse=True)
  
  return groups


@router.get("/chatbots/{chatbot_uuid}/topics/{topic}/questions", response_model=TopicQuestionsResponse)
def get_topic_questions(
  chatbot_uuid: str,
  topic: str,
  session: Session = Depends(get_session),
):
  """
  Get all user questions for a specific topic, grouped by semantic similarity.
  
  Questions like "do you offer services" and "what are your services" will be
  grouped together, while "do you offer consultation service" will be separate.
  """
  # Ensure chatbot exists
  chatbot = session.exec(
    select(Chatbot).where(Chatbot.uuid == chatbot_uuid)
  ).first()
  if not chatbot:
    raise HTTPException(status_code=404, detail="Chatbot not found")
  
  # Get all user messages with this topic
  messages = session.exec(
    select(Message)
    .where(Message.conversation_uuid.in_(
      select(Conversation.uuid).where(Conversation.chatbot_uuid == chatbot_uuid)
    ))
    .where(Message.role == "user")
    .where(Message.topic == topic)
    .order_by(Message.created_at.desc())
  ).all()
  
  if not messages:
    return TopicQuestionsResponse(
      topic=topic,
      question_groups=[],
      total_questions=0
    )
  
  # Extract question texts
  questions = [msg.content.strip() for msg in messages if msg.content.strip()]
  
  # Group similar questions
  question_groups = _group_similar_questions(questions, similarity_threshold=0.82)
  
  return TopicQuestionsResponse(
    topic=topic,
    question_groups=question_groups,
    total_questions=len(questions)
  )


