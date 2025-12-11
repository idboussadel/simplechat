"""add_tickets_table

Revision ID: add_tickets_table
Revises: 8936f86120af
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '8936f86120af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'tickets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('related_account', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('related_agent_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=True),
        sa.Column('problem_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('severity', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_uuid'], ['users.uuid'], ),
        sa.ForeignKeyConstraint(['related_agent_uuid'], ['chatbots.uuid'], ),
    )
    op.create_index('ix_tickets_user_uuid', 'tickets', ['user_uuid'], unique=False)
    op.create_index('ix_tickets_related_agent_uuid', 'tickets', ['related_agent_uuid'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_tickets_related_agent_uuid', table_name='tickets')
    op.drop_index('ix_tickets_user_uuid', table_name='tickets')
    op.drop_table('tickets')

