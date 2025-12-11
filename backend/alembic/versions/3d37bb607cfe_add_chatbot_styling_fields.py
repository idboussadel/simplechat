"""add_chatbot_styling_fields

Revision ID: 3d37bb607cfe
Revises: 41214a27b188
Create Date: 2025-11-25 03:09:30.178346

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d37bb607cfe'
down_revision: Union[str, Sequence[str], None] = '41214a27b188'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add styling customization columns to chatbots table
    op.add_column('chatbots', sa.Column('color_primary', sa.String(length=7), nullable=False, server_default='#000000'))
    op.add_column('chatbots', sa.Column('color_user_message', sa.String(length=7), nullable=False, server_default='#000000'))
    op.add_column('chatbots', sa.Column('color_bot_message', sa.String(length=7), nullable=False, server_default='#F3F4F6'))
    op.add_column('chatbots', sa.Column('color_background', sa.String(length=7), nullable=False, server_default='#FFFFFF'))
    op.add_column('chatbots', sa.Column('border_radius_chatbot', sa.Integer(), nullable=False, server_default='16'))
    op.add_column('chatbots', sa.Column('border_radius_messages', sa.Integer(), nullable=False, server_default='16'))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove styling customization columns from chatbots table
    op.drop_column('chatbots', 'border_radius_messages')
    op.drop_column('chatbots', 'border_radius_chatbot')
    op.drop_column('chatbots', 'color_background')
    op.drop_column('chatbots', 'color_bot_message')
    op.drop_column('chatbots', 'color_user_message')
    op.drop_column('chatbots', 'color_primary')
