from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlmodel import Field, SQLModel, Relationship
import uuid


class Plan(SQLModel, table=True):
    __tablename__ = "plans"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=50, unique=True, index=True)  # Free, Starter, Pro, Enterprise
    display_name: str = Field(max_length=100)
    description: Optional[str] = None
    price: float = Field(default=0.0)  # Monthly price in USD
    message_credits: int = Field(default=100)  # Monthly message allowance
    max_workspace_users: int = Field(default=1)  # Maximum users allowed in workspace
    features: Optional[str] = None  # JSON string of features
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    users: List["User"] = Relationship(back_populates="plan")


class User(SQLModel, table=True):
    __tablename__ = "users"
    
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    username: str = Field(index=True, unique=True, max_length=50)
    email: str = Field(index=True, unique=True, max_length=255)
    hashed_password: str
    is_active: bool = Field(default=True)
    
    # User type: admin, normal, customer_service
    user_type: str = Field(default="normal", max_length=20, index=True)
    
    # Subscription & Credits (only for users with plans - owners)
    # Invited users without accounts don't have plans or credits
    plan_id: Optional[int] = Field(default=None, foreign_key="plans.id", index=True)  # None for invited users without plans
    message_credits_remaining: Optional[int] = Field(default=None)  # None if no plan, otherwise remaining credits
    credits_reset_date: Optional[datetime] = Field(default=None)  # None if no plan
    subscription_status: str = Field(default="active", max_length=20)  # active, cancelled, expired
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    plan: Plan = Relationship(back_populates="users")
    chatbots: List["Chatbot"] = Relationship(back_populates="user")
    assigned_conversations: List["Conversation"] = Relationship(back_populates="assigned_to_user")
    owned_workspaces: List["Workspace"] = Relationship(back_populates="owner")
    workspace_memberships: List["WorkspaceMember"] = Relationship(back_populates="user")


class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"
    
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(max_length=100, index=True)
    description: Optional[str] = None
    owner_uuid: str = Field(foreign_key="users.uuid", index=True)  # Workspace creator/owner
    # Credits come from owner's plan, not stored here
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
    
    owner: User = Relationship(back_populates="owned_workspaces")
    members: List["WorkspaceMember"] = Relationship(back_populates="workspace")
    chatbots: List["Chatbot"] = Relationship(back_populates="workspace")
    invitations: List["WorkspaceInvitation"] = Relationship(back_populates="workspace")


class WorkspaceMember(SQLModel, table=True):
    __tablename__ = "workspace_members"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_uuid: str = Field(foreign_key="workspaces.uuid", index=True)
    user_uuid: str = Field(foreign_key="users.uuid", index=True)
    role: str = Field(default="member", max_length=20)  # owner, admin, member
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    
    workspace: Workspace = Relationship(back_populates="members")
    user: User = Relationship(back_populates="workspace_memberships")


class WorkspaceInvitation(SQLModel, table=True):
    __tablename__ = "workspace_invitations"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_uuid: str = Field(foreign_key="workspaces.uuid", index=True)
    email: str = Field(max_length=255, index=True)
    invited_by_uuid: str = Field(foreign_key="users.uuid", index=True)
    token: str = Field(unique=True, index=True, max_length=255)  # Unique invitation token
    status: str = Field(default="pending", max_length=20)  # pending, accepted, expired
    expires_at: datetime = Field(default_factory=lambda: datetime.utcnow() + timedelta(days=7))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: Optional[datetime] = None
    
    workspace: Workspace = Relationship(back_populates="invitations")
    invited_by: User = Relationship()


class Chatbot(SQLModel, table=True):
    __tablename__ = "chatbots"
    
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workspace_uuid: str = Field(foreign_key="workspaces.uuid", index=True)  # Belongs to workspace
    user_uuid: str = Field(foreign_key="users.uuid", index=True)  # Creator (for backwards compatibility and tracking)
    name: str = Field(max_length=100)
    description: Optional[str] = None
    language: str = Field(default="English", max_length=50)
    tone: str = Field(default="Professional", max_length=50)
    instructions: Optional[str] = None
    model_name: str = Field(default="gpt-4o-mini", max_length=50)
    is_active: bool = Field(default=True)
    
    # Styling customization
    color_primary: str = Field(default="#000000", max_length=7)  # Header & button background
    color_user_message: str = Field(default="#000000", max_length=7)  # User message background
    color_bot_message: str = Field(default="#F3F4F6", max_length=7)  # Bot message background
    color_background: str = Field(default="#FFFFFF", max_length=7)  # Chatbot window background
    border_radius_chatbot: int = Field(default=16)  # Chatbot window border radius (0-32)
    border_radius_messages: int = Field(default=16)  # Message bubbles border radius (0-24)
    border_radius_input: int = Field(default=24)  # Input field border radius (0-32)
    
    # Dark mode styling customization
    color_primary_dark: Optional[str] = Field(default=None, max_length=7)  # Header & button background (dark mode)
    color_user_message_dark: Optional[str] = Field(default=None, max_length=7)  # User message background (dark mode)
    color_bot_message_dark: Optional[str] = Field(default=None, max_length=7)  # Bot message background (dark mode)
    color_background_dark: Optional[str] = Field(default=None, max_length=7)  # Chatbot window background (dark mode)
    
    # Welcome message and examples
    welcome_message: Optional[str] = Field(default="Hi! What can I help you with?", max_length=500)
    example_messages: Optional[str] = Field(default=None)  # JSON array of example questions
    
    # Window size customization
    window_width: int = Field(default=380)  # Chatbot window width in pixels
    window_height: int = Field(default=600)  # Chatbot window height in pixels
    
    # Popup messages above chatbot button (for attention/attraction)
    popup_message_1: Optional[str] = Field(default=None, max_length=200)  # First popup message
    popup_message_2: Optional[str] = Field(default=None, max_length=200)  # Second popup message
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

    workspace: Workspace = Relationship(back_populates="chatbots")
    user: User = Relationship(back_populates="chatbots")  # Creator
    documents: List["Document"] = Relationship(back_populates="chatbot")
    conversations: List["Conversation"] = Relationship(back_populates="chatbot")
    website_links: List["WebsiteLink"] = Relationship(back_populates="chatbot", cascade_delete=True)


class Document(SQLModel, table=True):
    __tablename__ = "documents"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    filename: str = Field(max_length=255)
    file_path: str
    file_type: str = Field(max_length=50)
    file_size: int
    chunk_count: int = Field(default=0)
    status: str = Field(default="processing")
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    chatbot: Chatbot = Relationship(back_populates="documents")


class WebsiteLink(SQLModel, table=True):
    __tablename__ = "website_links"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    url: str = Field(max_length=2048, index=True)
    title: Optional[str] = Field(default=None, max_length=500)
    link_count: int = Field(default=0)  # Number of pages crawled
    chunk_count: int = Field(default=0)  # Total chunks created from all pages
    status: str = Field(default="pending", max_length=50)  # pending, crawling, completed, error, removed
    error_message: Optional[str] = None
    last_crawled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    chatbot: Chatbot = Relationship(back_populates="website_links")


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    customer_name: Optional[str] = Field(default="Anonymous", max_length=100)
    customer_email: Optional[str] = Field(max_length=255)
    customer_phone: Optional[str] = Field(max_length=50)
    session_id: str = Field(index=True, max_length=255)  # WebSocket session identifier
    client_uuid: Optional[str] = Field(default=None, index=True, max_length=255)  # Client identifier for grouping conversations
    status: str = Field(default="active", max_length=50)  # active, closed, archived
    handoff_status: str = Field(default="ai", max_length=20)  # ai, requested, human
    assigned_to_user_uuid: Optional[str] = Field(default=None, foreign_key="users.uuid", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column_kwargs={"onupdate": lambda: datetime.now(timezone.utc)})
    
    chatbot: Chatbot = Relationship(back_populates="conversations")
    messages: List["Message"] = Relationship(back_populates="conversation")
    assigned_to_user: Optional["User"] = Relationship(back_populates="assigned_conversations")


class Message(SQLModel, table=True):
    __tablename__ = "messages"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_uuid: str = Field(foreign_key="conversations.uuid", index=True)
    role: str = Field(max_length=20)  # "user", "assistant", or "agent"
    content: str
    feedback: Optional[str] = Field(default=None, max_length=10)  # "like", "dislike", or None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    topic: Optional[str] = Field(default=None, max_length=100, index=True)
    
    conversation: Conversation = Relationship(back_populates="messages")


class TopicStat(SQLModel, table=True):
    """Aggregated topic statistics per chatbot for fast analytics."""

    __tablename__ = "topic_stats"

    id: Optional[int] = Field(default=None, primary_key=True)
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    topic: str = Field(max_length=100, index=True)
    message_count: int = Field(default=0)
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    chatbot: Chatbot = Relationship()


class HandoffRequest(SQLModel, table=True):
    __tablename__ = "handoff_requests"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_uuid: str = Field(foreign_key="conversations.uuid", index=True)
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    status: str = Field(default="pending", max_length=20)  # pending, accepted, resolved
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: Optional[datetime] = None
    accepted_by_user_uuid: Optional[str] = Field(default=None, foreign_key="users.uuid", index=True)
    resolved_at: Optional[datetime] = None
    reason: Optional[str] = None  # Why handoff was requested
    
    conversation: Conversation = Relationship()
    chatbot: Chatbot = Relationship()
    accepted_by_user: Optional["User"] = Relationship()


class Ticket(SQLModel, table=True):
    __tablename__ = "tickets"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_uuid: str = Field(foreign_key="users.uuid", index=True)
    email: str = Field(max_length=255)
    related_account: Optional[str] = Field(default=None, max_length=255)  # Workspace/account name
    related_agent_uuid: Optional[str] = Field(default=None, foreign_key="chatbots.uuid", index=True)
    problem_type: str = Field(max_length=50)  # Billing, Account Management, Feature Request, Bugs/Issues, etc.
    severity: str = Field(max_length=20)  # Low, Medium, High, Critical
    subject: str = Field(max_length=255)
    description: str
    status: str = Field(default="open", max_length=20)  # open, in_progress, resolved, closed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
    
    user: User = Relationship()
    related_agent: Optional[Chatbot] = Relationship()


class BackgroundTask(SQLModel, table=True):
    __tablename__ = "background_tasks"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: str = Field(unique=True, index=True, max_length=255)  # Celery task ID
    task_type: str = Field(max_length=50, index=True)  # "document_processing", "website_crawling", etc.
    status: str = Field(default="pending", max_length=20, index=True)  # pending, processing, completed, failed
    progress: int = Field(default=0)  # 0-100 percentage
    result_data: Optional[str] = None  # JSON string with result data
    error_message: Optional[str] = None
    resource_type: str = Field(max_length=50)  # "document", "website_link", etc.
    resource_id: int = Field(index=True)  # ID of the document, website_link, etc.
    chatbot_uuid: str = Field(foreign_key="chatbots.uuid", index=True)
    user_uuid: str = Field(foreign_key="users.uuid", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
    completed_at: Optional[datetime] = None
    
    chatbot: Chatbot = Relationship()
    user: User = Relationship()
