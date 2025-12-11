"""add_topic_stats_and_message_topic

Revision ID: f1a2b3c4d5e6
Revises: e7f8g9h0i1j2
Create Date: 2025-11-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e7f8g9h0i1j2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add topic column to messages and topic_stats table."""
    # Add topic column to messages
    op.add_column(
        "messages",
        sa.Column(
            "topic",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=True,
        ),
    )
    op.create_index("ix_messages_topic", "messages", ["topic"], unique=False)

    # Create topic_stats table for aggregated analytics
    op.create_table(
        "topic_stats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "chatbot_uuid",
            sqlmodel.sql.sqltypes.AutoString(length=36),
            nullable=False,
        ),
        sa.Column(
            "topic",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=False,
        ),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["chatbot_uuid"], ["chatbots.uuid"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_topic_stats_chatbot_uuid", "topic_stats", ["chatbot_uuid"], unique=False
    )
    op.create_index("ix_topic_stats_topic", "topic_stats", ["topic"], unique=False)


def downgrade() -> None:
    """Rollback topic analytics schema."""
    # Drop topic_stats table
    op.drop_index("ix_topic_stats_topic", table_name="topic_stats")
    op.drop_index("ix_topic_stats_chatbot_uuid", table_name="topic_stats")
    op.drop_table("topic_stats")

    # Drop topic column from messages
    op.drop_index("ix_messages_topic", table_name="messages")
    op.drop_column("messages", "topic")


