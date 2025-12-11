from typing import Optional
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models import User
from app.schemas import UserCreate, LoginRequest
from app.auth import hash_password, verify_password, create_access_token


class AuthService:
    """Service layer for authentication and user management"""
    
    @staticmethod
    def register_user(user_data: UserCreate, session: Session) -> User:
        """
        Register a new user.
        Validates uniqueness and creates user account.
        """
        # Check if username or email already exists
        existing_user = session.exec(
            select(User).where((User.username == user_data.username) | (User.email == user_data.email))
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username or email already exists"
            )
        
        from datetime import datetime, timedelta
        
        # Create new user with hashed password and Basic plan (50 credits)
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hash_password(user_data.password),
            plan_id=1,  # Basic plan
            message_credits_remaining=50,  # Basic plan credits
            credits_reset_date=datetime.utcnow() + timedelta(days=30)
        )
        
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
        
        return db_user
    
    @staticmethod
    def authenticate_user(login_data: LoginRequest, session: Session) -> dict:
        """
        Authenticate user and return JWT token.
        Validates credentials and account status.
        """
        from datetime import timedelta
        
        # Find user by email
        user = session.exec(
            select(User).where(User.email == login_data.email)
        ).first()
        
        # Verify user exists and password is correct
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if account is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive"
            )
        
        # Set expiration based on "keep me logged in" option
        # 1 week if keep_me_logged_in is True, otherwise default (30 minutes)
        expires_delta = timedelta(weeks=1) if login_data.keep_me_logged_in else None
        
        # Generate JWT token
        access_token = create_access_token(data={"sub": user.uuid}, expires_delta=expires_delta)
        
        # Calculate expires_in in seconds
        expires_in = 604800 if login_data.keep_me_logged_in else 1800  # 1 week or 30 minutes
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": expires_in
        }
    
    @staticmethod
    def get_user_by_uuid(user_uuid: str, session: Session) -> Optional[User]:
        """Get user by UUID"""
        return session.get(User, user_uuid)
    
    @staticmethod
    def get_user_by_email(email: str, session: Session) -> Optional[User]:
        """Get user by email"""
        return session.exec(select(User).where(User.email == email)).first()
