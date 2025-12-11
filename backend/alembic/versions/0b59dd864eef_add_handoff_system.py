"""add_handoff_system

Revision ID: 0b59dd864eef
Revises: a80e73788a4c
Create Date: 2025-11-25 21:05:38.578095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '0b59dd864eef'
down_revision: Union[str, Sequence[str], None] = 'a80e73788a4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add handoff columns to conversations table
    op.add_column('conversations', sa.Column('handoff_status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='ai'))
    op.add_column('conversations', sa.Column('assigned_to_user_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f('ix_conversations_assigned_to_user_uuid'), 'conversations', ['assigned_to_user_uuid'], unique=False)
    op.create_foreign_key('fk_conversations_assigned_to_user_uuid_users', 'conversations', 'users', ['assigned_to_user_uuid'], ['uuid'])
    
    # Create handoff_requests table
    op.create_table('handoff_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('chatbot_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='pending'),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('accepted_by_user_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('reason', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_handoff_requests_conversation_uuid'), 'handoff_requests', ['conversation_uuid'], unique=False)
    op.create_index(op.f('ix_handoff_requests_chatbot_uuid'), 'handoff_requests', ['chatbot_uuid'], unique=False)
    op.create_index(op.f('ix_handoff_requests_accepted_by_user_uuid'), 'handoff_requests', ['accepted_by_user_uuid'], unique=False)
    op.create_foreign_key('fk_handoff_requests_conversation_uuid_conversations', 'handoff_requests', 'conversations', ['conversation_uuid'], ['uuid'])
    op.create_foreign_key('fk_handoff_requests_chatbot_uuid_chatbots', 'handoff_requests', 'chatbots', ['chatbot_uuid'], ['uuid'])
    op.create_foreign_key('fk_handoff_requests_accepted_by_user_uuid_users', 'handoff_requests', 'users', ['accepted_by_user_uuid'], ['uuid'])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop handoff_requests table
    op.drop_table('handoff_requests')
    
    # Remove handoff columns from conversations table
    op.drop_constraint('fk_conversations_assigned_to_user_uuid_users', 'conversations', type_='foreignkey')
    op.drop_index(op.f('ix_conversations_assigned_to_user_uuid'), table_name='conversations')
    op.drop_column('conversations', 'assigned_to_user_uuid')
    op.drop_column('conversations', 'handoff_status')
