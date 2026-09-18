"""Alert rule model — per-project rules, or org-wide defaults applied per project."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class AlertRule(SQLModel, table=True):
    """A project's own alert rule, or an org-wide default when project_id is None.

    An org-wide rule (organization_id set) is evaluated independently against
    every project in that organization, except one that already has its own
    active rule for the same metric — that project's rule wins, and forking
    the org-wide rule is how a project acquires one deliberately. See
    evaluator.py and alerts/service.py's fork_alert_rule.
    """

    __tablename__ = "alert_rules"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    name: str = Field(max_length=255)
    metric: str = Field(max_length=50)
    comparison: str = Field(default="gt", max_length=10)
    threshold: float
    window_minutes: int = Field(default=60)
    notify_email: str | None = Field(default=None, max_length=255)
    is_active: bool = Field(default=True)
    last_triggered_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class AlertRuleTrigger(SQLModel, table=True):
    """Per-project cooldown state for an org-wide rule.

    One org-wide AlertRule row is evaluated against many projects
    independently, so its cooldown can't live on the rule itself the way a
    project-owned rule's last_triggered_at scalar does — each project needs
    its own last-fired timestamp.
    """

    __tablename__ = "alert_rule_triggers"
    __table_args__ = ({"extend_existing": True},)

    rule_id: uuid.UUID = Field(foreign_key="alert_rules.id", primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", primary_key=True)
    last_triggered_at: datetime = Field(default_factory=utc_now)
