"""add_client_uuid_to_conversations

Revision ID: a1b2c3d4e5f7
Revises: e7f8g9h0i1j2
Create Date: 2025-01-27 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'add_window_size_popup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add client_uuid column to conversations table
    op.add_column('conversations', sa.Column('client_uuid', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.create_index(op.f('ix_conversations_client_uuid'), 'conversations', ['client_uuid'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Remove client_uuid column from conversations table
    op.drop_index(op.f('ix_conversations_client_uuid'), table_name='conversations')
    op.drop_column('conversations', 'client_uuid')

