import os
from sqlmodel import Session, create_engine, SQLModel
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable must be set")

# Production-ready engine configuration
engine = create_engine(
    DATABASE_URL,
    echo=False,  # Disable SQL logging in production
    pool_pre_ping=True,  # Verify connections before using
    pool_size=10,  # Connection pool size
    max_overflow=20,  # Maximum overflow connections
    pool_recycle=3600,  # Recycle connections after 1 hour
)

# SessionLocal for use in Celery tasks and other contexts
# Creates a new session when called
def SessionLocal():
    """Create a new database session for use in Celery tasks"""
    return Session(engine)


def get_session():
    """Dependency for database sessions with automatic cleanup"""
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    """Create all database tables"""
    SQLModel.metadata.create_all(engine)
