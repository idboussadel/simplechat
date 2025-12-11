"""add_workspace_system

Revision ID: workspace_system_001
Revises: f1a2b3c4d5e6
Create Date: 2025-11-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from datetime import datetime, timedelta
import uuid


# revision identifiers, used by Alembic.
revision: str = 'workspace_system_001'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'  # Points to current head
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add workspace system with user types and workspace management."""
    
    # Add max_workspace_users to plans table
    op.add_column('plans', sa.Column('max_workspace_users', sa.Integer(), nullable=False, server_default='1'))
    
    # Add user_type to users table
    op.add_column('users', sa.Column('user_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='normal'))
    op.create_index(op.f('ix_users_user_type'), 'users', ['user_type'], unique=False)
    
    # Make user credits fields nullable (for invited users without plans)
    # Credits are managed at user level (owner), not workspace level
    op.alter_column('users', 'plan_id',
                   existing_type=sa.Integer(),
                   nullable=True)
    op.alter_column('users', 'message_credits_remaining',
                   existing_type=sa.Integer(),
                   nullable=True)
    op.alter_column('users', 'credits_reset_date',
                   existing_type=sa.DateTime(),
                   nullable=True)
    
    # Create workspaces table (credits come from owner, not stored here)
    op.create_table('workspaces',
        sa.Column('uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('owner_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('uuid'),
        sa.ForeignKeyConstraint(['owner_uuid'], ['users.uuid'], ),
    )
    op.create_index(op.f('ix_workspaces_name'), 'workspaces', ['name'], unique=False)
    op.create_index(op.f('ix_workspaces_owner_uuid'), 'workspaces', ['owner_uuid'], unique=False)
    
    # Create workspace_members table
    op.create_table('workspace_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('user_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_uuid'], ['workspaces.uuid'], ),
        sa.ForeignKeyConstraint(['user_uuid'], ['users.uuid'], ),
    )
    op.create_index(op.f('ix_workspace_members_workspace_uuid'), 'workspace_members', ['workspace_uuid'], unique=False)
    op.create_index(op.f('ix_workspace_members_user_uuid'), 'workspace_members', ['user_uuid'], unique=False)
    
    # Create workspace_invitations table
    op.create_table('workspace_invitations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('invited_by_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column('token', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='pending'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_uuid'], ['workspaces.uuid'], ),
        sa.ForeignKeyConstraint(['invited_by_uuid'], ['users.uuid'], ),
    )
    op.create_index(op.f('ix_workspace_invitations_workspace_uuid'), 'workspace_invitations', ['workspace_uuid'], unique=False)
    op.create_index(op.f('ix_workspace_invitations_email'), 'workspace_invitations', ['email'], unique=False)
    op.create_index(op.f('ix_workspace_invitations_token'), 'workspace_invitations', ['token'], unique=True)
    
    # Add workspace_uuid to chatbots table
    op.add_column('chatbots', sa.Column('workspace_uuid', sqlmodel.sql.sqltypes.AutoString(length=36), nullable=True))
    op.create_index(op.f('ix_chatbots_workspace_uuid'), 'chatbots', ['workspace_uuid'], unique=False)
    
    # Create default workspace for each existing user and migrate their chatbots
    connection = op.get_bind()
    
    # Get all users
    users_result = connection.execute(sa.text("SELECT uuid, username FROM users"))
    users = users_result.fetchall()
    
    for user_uuid, username in users:
        # Create workspace for user
        workspace_uuid = str(uuid.uuid4())
        workspace_name = f"{username}'s Workspace"
        
        connection.execute(sa.text("""
            INSERT INTO workspaces (uuid, name, owner_uuid, created_at, updated_at)
            VALUES (:uuid, :name, :owner_uuid, :created_at, :updated_at)
        """), {
            'uuid': workspace_uuid,
            'name': workspace_name,
            'owner_uuid': user_uuid,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })
        
        # Add user as workspace owner
        connection.execute(sa.text("""
            INSERT INTO workspace_members (workspace_uuid, user_uuid, role, joined_at)
            VALUES (:workspace_uuid, :user_uuid, 'owner', :joined_at)
        """), {
            'workspace_uuid': workspace_uuid,
            'user_uuid': user_uuid,
            'joined_at': datetime.utcnow()
        })
        
        # Migrate user's chatbots to workspace
        connection.execute(sa.text("""
            UPDATE chatbots
            SET workspace_uuid = :workspace_uuid
            WHERE user_uuid = :user_uuid
        """), {
            'workspace_uuid': workspace_uuid,
            'user_uuid': user_uuid
        })
    
    # Make workspace_uuid NOT NULL after migration
    op.alter_column('chatbots', 'workspace_uuid', nullable=False)
    op.create_foreign_key('fk_chatbots_workspace_uuid', 'chatbots', 'workspaces', ['workspace_uuid'], ['uuid'])
    
    # Update plans to have max_workspace_users
    connection.execute(sa.text("""
        UPDATE plans SET max_workspace_users = 1 WHERE name = 'Free' OR name = 'Basic'
    """))
    connection.execute(sa.text("""
        UPDATE plans SET max_workspace_users = 5 WHERE name = 'Starter'
    """))
    connection.execute(sa.text("""
        UPDATE plans SET max_workspace_users = 10 WHERE name = 'Pro'
    """))
    connection.execute(sa.text("""
        UPDATE plans SET max_workspace_users = 50 WHERE name = 'Enterprise'
    """))


def downgrade() -> None:
    """Rollback workspace system."""
    
    # Remove foreign key and index from chatbots
    op.drop_constraint('fk_chatbots_workspace_uuid', 'chatbots', type_='foreignkey')
    op.drop_index(op.f('ix_chatbots_workspace_uuid'), table_name='chatbots')
    op.drop_column('chatbots', 'workspace_uuid')
    
    # Drop workspace tables
    op.drop_index(op.f('ix_workspace_invitations_token'), table_name='workspace_invitations')
    op.drop_index(op.f('ix_workspace_invitations_email'), table_name='workspace_invitations')
    op.drop_index(op.f('ix_workspace_invitations_workspace_uuid'), table_name='workspace_invitations')
    op.drop_table('workspace_invitations')
    
    op.drop_index(op.f('ix_workspace_members_user_uuid'), table_name='workspace_members')
    op.drop_index(op.f('ix_workspace_members_workspace_uuid'), table_name='workspace_members')
    op.drop_table('workspace_members')
    
    op.drop_index(op.f('ix_workspaces_owner_uuid'), table_name='workspaces')
    op.drop_index(op.f('ix_workspaces_name'), table_name='workspaces')
    op.drop_table('workspaces')
    
    # Revert user credits fields to non-nullable
    op.alter_column('users', 'plan_id',
                   existing_type=sa.Integer(),
                   nullable=False)
    op.alter_column('users', 'message_credits_remaining',
                   existing_type=sa.Integer(),
                   nullable=False)
    op.alter_column('users', 'credits_reset_date',
                   existing_type=sa.DateTime(),
                   nullable=False)
    
    # Remove user_type from users
    op.drop_index(op.f('ix_users_user_type'), table_name='users')
    op.drop_column('users', 'user_type')
    
    # Remove max_workspace_users from plans
    op.drop_column('plans', 'max_workspace_users')

