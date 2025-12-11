from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlmodel import Session, select
from app.database import get_session
from app.models import User
from app.schemas import UserCreate, UserResponse, LoginRequest, TokenResponse, UserUpdate, ChangePasswordRequest
from app.auth import get_current_user, hash_password, verify_password
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, session: Session = Depends(get_session)):
    """Register a new user account"""
    return AuthService.register_user(user_data, session)


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, session: Session = Depends(get_session)):
    """Authenticate user and return JWT token"""
    return AuthService.authenticate_user(login_data, session)


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get current authenticated user information.
    
    For users without plans (invited users), returns credits from workspaces
    they're members of (from the owner's plan).
    """
    from app.models import WorkspaceMember, Workspace
    from app.services.credits_service import credits_service
    
    # If user has a plan, return as-is
    if current_user.plan_id:
        return current_user
    
    # For users without plans, get credits from workspaces they're members of
    # Use the first workspace they're a member of (or the one with most credits)
    member_workspaces = session.exec(
        select(Workspace)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_uuid == current_user.uuid)
    ).all()
    
    if member_workspaces:
        # Get credits from the first workspace (owner's credits)
        workspace = member_workspaces[0]
        credits_info = credits_service.get_workspace_credits_info(workspace.uuid, session)
        
        # Create a response with workspace owner's credits info
        # Note: We're not modifying the user object, just the response
        user_dict = {
            "uuid": current_user.uuid,
            "username": current_user.username,
            "email": current_user.email,
            "is_active": current_user.is_active,
            "plan_id": None,  # User doesn't have a plan
            "message_credits_remaining": credits_info["credits_remaining"],
            "credits_reset_date": credits_info["credits_reset_date"],
            "subscription_status": current_user.subscription_status,
            "user_type": current_user.user_type,
            "created_at": current_user.created_at
        }
        return UserResponse(**user_dict)
    
    # No workspaces, return user as-is (all None for credits)
    return current_user


@router.get("/user/{user_uuid}", response_model=UserResponse)
def get_user_by_uuid(
    user_uuid: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get user information by UUID (for displaying assigned agents)"""
    user = session.get(User, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Only return basic info (username, email) - no sensitive data
    return user


@router.patch("/me", response_model=UserResponse)
def update_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update user profile (username and/or email)"""
    
    # Check if username is being changed and if it's already taken
    if user_update.username and user_update.username != current_user.username:
        existing_user = session.exec(
            select(User).where(User.username == user_update.username)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = user_update.username
    
    # Check if email is being changed and if it's already taken
    if user_update.email and user_update.email != current_user.email:
        existing_user = session.exec(
            select(User).where(User.email == user_update.email)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already taken"
            )
        current_user.email = user_update.email
    
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    return current_user


@router.post("/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Change user password"""
    
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Hash and update password
    current_user.hashed_password = hash_password(password_data.new_password)
    session.add(current_user)
    session.commit()
    
    return {"message": "Password changed successfully"}