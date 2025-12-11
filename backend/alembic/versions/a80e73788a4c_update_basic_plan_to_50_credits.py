"""update_basic_plan_to_50_credits

Revision ID: a80e73788a4c
Revises: abf0e11ecea5
Create Date: 2025-11-25 05:32:23.440079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a80e73788a4c'
down_revision: Union[str, Sequence[str], None] = 'abf0e11ecea5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Update Basic plan (id=1) to have 50 credits
    op.execute("""
        UPDATE plans 
        SET name = 'basic',
            display_name = 'Basic',
            message_credits = 50,
            features = '{"features": ["50 messages/month", "1 chatbot", "Basic support"]}'
        WHERE id = 1
    """)
    
    # Update existing users on Basic plan to have 50 credits (cap at 50 if they have more)
    op.execute("""
        UPDATE users 
        SET message_credits_remaining = LEAST(message_credits_remaining, 50)
        WHERE plan_id = 1 AND message_credits_remaining > 50
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # Revert Basic plan back to Free with 100 credits
    op.execute("""
        UPDATE plans 
        SET name = 'free',
            display_name = 'Free',
            message_credits = 100,
            features = '{"features": ["100 messages/month", "1 chatbot", "Basic support"]}'
        WHERE id = 1
    """)
    
    # Update users back to 100 credits
    op.execute("""
        UPDATE users 
        SET message_credits_remaining = 100
        WHERE plan_id = 1
    """)
