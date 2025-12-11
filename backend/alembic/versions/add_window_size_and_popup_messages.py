"""add_window_size_and_popup_messages

Revision ID: add_window_size_popup
Revises: e7f8g9h0i1j2
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_window_size_popup'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add window size columns to chatbots table
    op.add_column('chatbots', sa.Column('window_width', sa.Integer(), nullable=False, server_default='380'))
    op.add_column('chatbots', sa.Column('window_height', sa.Integer(), nullable=False, server_default='600'))
    
    # Add popup message columns to chatbots table
    op.add_column('chatbots', sa.Column('popup_message_1', sa.String(length=200), nullable=True))
    op.add_column('chatbots', sa.Column('popup_message_2', sa.String(length=200), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove popup message columns from chatbots table
    op.drop_column('chatbots', 'popup_message_2')
    op.drop_column('chatbots', 'popup_message_1')
    
    # Remove window size columns from chatbots table
    op.drop_column('chatbots', 'window_height')
    op.drop_column('chatbots', 'window_width')

