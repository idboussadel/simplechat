from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# Auth schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    keep_me_logged_in: bool = Field(default=False)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 1800  # 30 minutes in seconds


# User schemas
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern="^[a-zA-Z0-9_-]+$")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce strong password requirements"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


class UserResponse(BaseModel):
    uuid: str
    username: str
    email: str
    is_active: bool
    plan_id: Optional[int] = None  # None for invited users without plans
    message_credits_remaining: Optional[int] = None  # None for invited users without plans
    credits_reset_date: Optional[datetime] = None  # None for invited users without plans
    subscription_status: str
    user_type: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50, pattern="^[a-zA-Z0-9_-]+$")
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=72)
    new_password: str = Field(..., min_length=8, max_length=72)
    
    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce strong password requirements"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


# Plan schemas
class PlanResponse(BaseModel):
    id: int
    name: str
    display_name: str
    description: Optional[str]
    price: float
    message_credits: int
    features: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True


# Chatbot schemas
class ChatbotCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: str = "English"
    tone: str = "Professional"
    instructions: Optional[str] = None
    model_name: str = "gpt-4o-mini"


class ChatbotUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    instructions: Optional[str] = None
    model_name: Optional[str] = None
    is_active: Optional[bool] = None
    
    # Styling customization
    color_primary: Optional[str] = None
    color_user_message: Optional[str] = None
    color_bot_message: Optional[str] = None
    color_background: Optional[str] = None
    border_radius_chatbot: Optional[int] = None
    border_radius_messages: Optional[int] = None
    border_radius_input: Optional[int] = None
    color_primary_dark: Optional[str] = None
    color_user_message_dark: Optional[str] = None
    color_bot_message_dark: Optional[str] = None
    color_background_dark: Optional[str] = None
    
    # Welcome message and examples
    welcome_message: Optional[str] = None
    example_messages: Optional[str] = None
    
    # Window size customization
    window_width: Optional[int] = None
    window_height: Optional[int] = None
    
    # Popup messages above chatbot button
    popup_message_1: Optional[str] = None
    popup_message_2: Optional[str] = None


class ChatbotResponse(BaseModel):
    uuid: str
    user_uuid: str
    name: str
    description: Optional[str]
    language: str
    tone: str
    instructions: Optional[str]
    model_name: str
    is_active: bool
    
    # Styling customization
    color_primary: str
    color_user_message: str
    color_bot_message: str
    color_background: str
    border_radius_chatbot: int
    border_radius_messages: int
    border_radius_input: int
    color_primary_dark: Optional[str] = None
    color_user_message_dark: Optional[str] = None
    color_bot_message_dark: Optional[str] = None
    color_background_dark: Optional[str] = None
    
    # Welcome message and examples
    welcome_message: Optional[str] = None
    example_messages: Optional[str] = None
    
    # Window size customization
    window_width: int
    window_height: int
    
    # Popup messages above chatbot button
    popup_message_1: Optional[str] = None
    popup_message_2: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentUploadResponse(BaseModel):
    id: int
    chatbot_uuid: str
    filename: str
    file_type: str
    file_size: int
    status: str
    created_at: datetime


class DocumentResponse(BaseModel):
    id: int
    chatbot_uuid: str
    filename: str
    file_type: str
    file_size: int
    chunk_count: int
    status: str
    error_message: Optional[str]
    created_at: datetime