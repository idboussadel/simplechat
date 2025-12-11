from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.database import get_session
from app.models import Plan, User
from app.schemas import PlanResponse
from app.auth import get_current_user
from app.services.credits_service import credits_service

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plans", response_model=List[PlanResponse])
def get_plans(
    session: Session = Depends(get_session)
):
    """Get all available plans"""
    plans = session.exec(select(Plan).where(Plan.is_active == True)).all()
    return plans


@router.get("/user/credits")
def get_user_credits(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get current user's credit information"""
    return credits_service.get_user_credits_info(current_user, session)


@router.post("/user/upgrade-plan")
def upgrade_plan(
    plan_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Upgrade user to a different plan"""
    plan = session.exec(select(Plan).where(Plan.id == plan_id)).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Update user's plan
    current_user.plan_id = plan_id
    current_user.message_credits_remaining = plan.message_credits
    current_user.subscription_status = "active"
    
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    return {
        "message": f"Successfully upgraded to {plan.display_name}",
        "credits_remaining": current_user.message_credits_remaining
    }

