"""add_feedback_to_messages

Revision ID: 8936f86120af
Revises: 9f83850e9c56
Create Date: 2025-11-27 23:15:10.157672

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '8936f86120af'
down_revision: Union[str, Sequence[str], None] = '9f83850e9c56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add feedback column to messages table
    op.add_column('messages', sa.Column('feedback', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # Remove feedback column from messages table
    op.drop_column('messages', 'feedback')
    op.alter_column('chatbots', 'example_messages',
               existing_type=sqlmodel.sql.sqltypes.AutoString(),
               type_=sa.TEXT(),
               existing_nullable=True)
    # ### end Alembic commands ###
