"""clawdata_v2_unbox

Drop secrets + templates tables, simplify agents, add guardrail_policies + audit_log.

Revision ID: a1b2c3d4e5f6
Revises: 72f398bbf35f
Create Date: 2025-07-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "72f398bbf35f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Drop legacy tables ──────────────────────────────────────
    op.drop_table("secrets")
    op.drop_table("templates")

    # ── Simplify agents ─────────────────────────────────────────
    # Remove columns that no longer exist in the model
    with op.batch_alter_table("agents") as batch_op:
        batch_op.drop_column("workspace_path")
        batch_op.drop_column("agent_dir")
        batch_op.drop_column("openclaw_workspace")
        batch_op.drop_column("source")
        batch_op.add_column(
            sa.Column("guardrail_policy_id", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("tags", sa.JSON(), nullable=True)
        )

    # ── Create guardrail_policies ───────────────────────────────
    op.create_table(
        "guardrail_policies",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        # Cost guardrails
        sa.Column("max_cost_per_run", sa.Float(), nullable=True),
        sa.Column("max_cost_per_day", sa.Float(), nullable=True),
        sa.Column("max_tokens_per_message", sa.Integer(), nullable=True),
        # Tool guardrails
        sa.Column("tool_allowlist", sa.JSON(), nullable=True),
        sa.Column("tool_denylist", sa.JSON(), nullable=True),
        sa.Column("require_approval_for", sa.JSON(), nullable=True),
        # Time guardrails
        sa.Column("max_run_duration_seconds", sa.Integer(), nullable=True),
        # Content guardrails
        sa.Column("block_patterns", sa.JSON(), nullable=True),
        sa.Column("redact_patterns", sa.JSON(), nullable=True),
        # Scheduling guardrails
        sa.Column("allowed_hours", sa.JSON(), nullable=True),
        sa.Column("allowed_days", sa.JSON(), nullable=True),
        # Meta
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("(datetime('now'))")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("(datetime('now'))")),
    )

    # ── Create audit_log ────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("(datetime('now'))")),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("guardrail_id", sa.String(length=64), nullable=True),
        sa.Column("guardrail_action", sa.String(length=32), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("estimated_cost", sa.Float(), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])
    op.create_index("ix_audit_log_event_type", "audit_log", ["event_type"])
    op.create_index("ix_audit_log_agent_id", "audit_log", ["agent_id"])
    op.create_index("ix_audit_log_event_type_timestamp", "audit_log", ["event_type", "timestamp"])


def downgrade() -> None:
    # ── Drop new tables ─────────────────────────────────────────
    op.drop_index("ix_audit_log_event_type_timestamp", "audit_log")
    op.drop_index("ix_audit_log_agent_id", "audit_log")
    op.drop_index("ix_audit_log_event_type", "audit_log")
    op.drop_index("ix_audit_log_timestamp", "audit_log")
    op.drop_table("audit_log")
    op.drop_table("guardrail_policies")

    # ── Restore agents columns ──────────────────────────────────
    with op.batch_alter_table("agents") as batch_op:
        batch_op.drop_column("tags")
        batch_op.drop_column("guardrail_policy_id")
        batch_op.add_column(
            sa.Column("workspace_path", sa.String(length=512), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column("agent_dir", sa.String(length=512), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column("openclaw_workspace", sa.String(length=512), nullable=True)
        )
        batch_op.add_column(
            sa.Column("source", sa.String(length=32), nullable=False, server_default="local")
        )

    # ── Recreate legacy tables ──────────────────────────────────
    op.create_table(
        "secrets",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "templates",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("variables", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
