from datetime import datetime, timedelta
from sqlmodel import Session, select
from app.models import User, Plan, Workspace, Chatbot
from fastapi import HTTPException, status
from typing import Optional


class CreditsService:
    """Service to manage message credits.
    
    Credits are managed at the USER level (owner), not workspace level.
    All workspaces owned by a user share the same credit pool from the owner's plan.
    """
    
    @staticmethod
    def _check_and_reset_user_credits(user: User, session: Session) -> User:
        """Check if user credits need to be reset (monthly renewal).
        
        Only applies to users with plans. Users without plans (invited users)
        don't have credits and can only use workspaces they're invited to.
        """
        # Users without plans don't have credits
        if not user.plan_id or user.message_credits_remaining is None:
            return user
        
        current_time = datetime.utcnow()
        
        # If reset date has passed, reset credits
        if user.credits_reset_date and current_time >= user.credits_reset_date:
            plan = session.exec(select(Plan).where(Plan.id == user.plan_id)).first()
            if plan:
                user.message_credits_remaining = plan.message_credits
                user.credits_reset_date = current_time + timedelta(days=30)
                session.add(user)
                session.commit()
                session.refresh(user)
        
        return user
    
    @staticmethod
    def get_workspace_owner(workspace_uuid: str, session: Session) -> Optional[User]:
        """Get the owner of a workspace."""
        workspace = session.get(Workspace, workspace_uuid)
        if not workspace:
            return None
        return session.get(User, workspace.owner_uuid)
    
    @staticmethod
    def get_chatbot_owner(chatbot_uuid: str, session: Session) -> Optional[User]:
        """Get the owner of a chatbot's workspace."""
        chatbot = session.get(Chatbot, chatbot_uuid)
        if not chatbot:
            return None
        
        workspace = session.get(Workspace, chatbot.workspace_uuid)
        if not workspace:
            return None
        
        return session.get(User, workspace.owner_uuid)
    
    @staticmethod
    def has_credits_for_chatbot(chatbot_uuid: str, session: Session) -> bool:
        """Check if the chatbot's workspace owner has available credits."""
        owner = CreditsService.get_chatbot_owner(chatbot_uuid, session)
        if not owner:
            return False
        
        # Owner must have a plan to have credits
        if not owner.plan_id:
            return False
        
        owner = CreditsService._check_and_reset_user_credits(owner, session)
        return owner.message_credits_remaining is not None and owner.message_credits_remaining > 0
    
    @staticmethod
    def deduct_credit_for_chatbot(chatbot_uuid: str, session: Session, amount: int = 1) -> User:
        """Deduct credits from the chatbot's workspace owner.
        
        Returns the owner user (not workspace) since credits are at user level.
        """
        owner = CreditsService.get_chatbot_owner(chatbot_uuid, session)
        if not owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chatbot or workspace not found"
            )
        
        # Owner must have a plan
        if not owner.plan_id:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Workspace owner does not have a plan. Please upgrade to use chatbots."
            )
        
        owner = CreditsService._check_and_reset_user_credits(owner, session)
        
        if owner.message_credits_remaining is None or owner.message_credits_remaining < amount:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient message credits. Workspace owner has {owner.message_credits_remaining or 0} credits remaining."
            )
        
        owner.message_credits_remaining -= amount
        session.add(owner)
        session.commit()
        session.refresh(owner)
        
        return owner
    
    @staticmethod
    def has_credits(user: User, session: Session) -> bool:
        """Check if user has available credits.
        
        Only applies to users with plans. Users without plans return False.
        """
        if not user.plan_id:
            return False
        
        user = CreditsService._check_and_reset_user_credits(user, session)
        return user.message_credits_remaining is not None and user.message_credits_remaining > 0
    
    @staticmethod
    def deduct_credit(user: User, session: Session, amount: int = 1) -> User:
        """Deduct credits from user account.
        
        Only applies to users with plans.
        """
        if not user.plan_id:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="User does not have a plan. Please upgrade to use chatbots."
            )
        
        user = CreditsService._check_and_reset_user_credits(user, session)
        
        if user.message_credits_remaining is None or user.message_credits_remaining < amount:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient message credits. You have {user.message_credits_remaining or 0} credits remaining."
            )
        
        user.message_credits_remaining -= amount
        session.add(user)
        session.commit()
        session.refresh(user)
        
        return user
    
    @staticmethod
    def get_workspace_credits_info(workspace_uuid: str, session: Session) -> dict:
        """Get workspace credit information.
        
        Returns the owner's credit information since credits are at owner level.
        """
        workspace = session.get(Workspace, workspace_uuid)
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        
        owner = session.get(User, workspace.owner_uuid)
        if not owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace owner not found"
            )
        
        owner = CreditsService._check_and_reset_user_credits(owner, session)
        plan = session.get(Plan, owner.plan_id) if owner.plan_id else None
        
        return {
            "credits_remaining": owner.message_credits_remaining or 0,
            "credits_total": plan.message_credits if plan else 0,
            "credits_reset_date": owner.credits_reset_date,
            "plan_name": plan.display_name if plan else "No Plan",
        }
    
    @staticmethod
    def get_user_credits_info(user: User, session: Session) -> dict:
        """Get user's credit information.
        
        Returns None/0 for users without plans.
        """
        if not user.plan_id:
            return {
                "credits_remaining": 0,
                "credits_total": 0,
                "credits_reset_date": None,
                "plan_name": "No Plan",
                "subscription_status": user.subscription_status
            }
        
        user = CreditsService._check_and_reset_user_credits(user, session)
        plan = session.exec(select(Plan).where(Plan.id == user.plan_id)).first()
        
        return {
            "credits_remaining": user.message_credits_remaining or 0,
            "credits_total": plan.message_credits if plan else 0,
            "credits_reset_date": user.credits_reset_date,
            "plan_name": plan.display_name if plan else "Unknown",
            "subscription_status": user.subscription_status
        }


credits_service = CreditsService()
