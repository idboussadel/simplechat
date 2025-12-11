"""add_dark_mode_colors_to_chatbots

Revision ID: 487e2e141cf4
Revises: 0b59dd864eef
Create Date: 2025-11-26 03:02:32.839172

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '487e2e141cf4'
down_revision: Union[str, Sequence[str], None] = '0b59dd864eef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add dark mode color columns to chatbots table
    op.add_column('chatbots', sa.Column('color_primary_dark', sqlmodel.sql.sqltypes.AutoString(length=7), nullable=True))
    op.add_column('chatbots', sa.Column('color_user_message_dark', sqlmodel.sql.sqltypes.AutoString(length=7), nullable=True))
    op.add_column('chatbots', sa.Column('color_bot_message_dark', sqlmodel.sql.sqltypes.AutoString(length=7), nullable=True))
    op.add_column('chatbots', sa.Column('color_background_dark', sqlmodel.sql.sqltypes.AutoString(length=7), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove dark mode color columns from chatbots table
    op.drop_column('chatbots', 'color_background_dark')
    op.drop_column('chatbots', 'color_bot_message_dark')
    op.drop_column('chatbots', 'color_user_message_dark')
    op.drop_column('chatbots', 'color_primary_dark')
