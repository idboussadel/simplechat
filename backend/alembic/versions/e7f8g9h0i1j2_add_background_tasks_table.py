"""add_background_tasks_table

Revision ID: e7f8g9h0i1j2
Revises: a1b2c3d4e5f6
Create Date: 2025-01-27 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e7f8g9h0i1j2'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'background_tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('task_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='pending'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('result_data', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('resource_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=False),
        sa.Column('chatbot_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('user_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['chatbot_uuid'], ['chatbots.uuid'], ),
        sa.ForeignKeyConstraint(['user_uuid'], ['users.uuid'], ),
    )
    op.create_index('ix_background_tasks_task_id', 'background_tasks', ['task_id'], unique=True)
    op.create_index('ix_background_tasks_task_type', 'background_tasks', ['task_type'], unique=False)
    op.create_index('ix_background_tasks_status', 'background_tasks', ['status'], unique=False)
    op.create_index('ix_background_tasks_resource_id', 'background_tasks', ['resource_id'], unique=False)
    op.create_index('ix_background_tasks_chatbot_uuid', 'background_tasks', ['chatbot_uuid'], unique=False)
    op.create_index('ix_background_tasks_user_uuid', 'background_tasks', ['user_uuid'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_background_tasks_user_uuid', table_name='background_tasks')
    op.drop_index('ix_background_tasks_chatbot_uuid', table_name='background_tasks')
    op.drop_index('ix_background_tasks_resource_id', table_name='background_tasks')
    op.drop_index('ix_background_tasks_status', table_name='background_tasks')
    op.drop_index('ix_background_tasks_task_type', table_name='background_tasks')
    op.drop_index('ix_background_tasks_task_id', table_name='background_tasks')
    op.drop_table('background_tasks')









