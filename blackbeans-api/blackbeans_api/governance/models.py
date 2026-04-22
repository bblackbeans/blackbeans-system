import uuid

from django.conf import settings
from django.db import models
from django.db.models import CASCADE
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import ForeignKey
from django.db.models import JSONField
from django.db.models import TextField
from django.db.models import UniqueConstraint
from django.db.models import UUIDField
from django.utils.translation import gettext_lazy as _


class Workspace(models.Model):
    """Stub de workspace para RBAC ate o Epic 2 enriquecer o dominio operacional."""

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = CharField(_("Name"), max_length=255)
    client = ForeignKey(
        "clients.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workspaces",
    )
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Workspace")
        verbose_name_plural = _("Workspaces")

    def __str__(self) -> str:
        return self.name


class Portfolio(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = ForeignKey(Workspace, on_delete=CASCADE, related_name="portfolios")
    name = CharField(_("Name"), max_length=255, blank=True, default="")
    description = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Portfolio")
        verbose_name_plural = _("Portfolios")

    def __str__(self) -> str:
        return self.name or str(self.pk)


class Project(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", _("Planned")
        ACTIVE = "active", _("Active")
        ON_HOLD = "on_hold", _("On Hold")
        COMPLETED = "completed", _("Completed")
        AT_RISK = "at_risk", _("At Risk")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = ForeignKey(Portfolio, on_delete=CASCADE, related_name="projects")
    client = ForeignKey(
        "clients.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    name = CharField(_("Name"), max_length=255, blank=True, default="")
    description = TextField(blank=True, default="")
    status = CharField(max_length=24, choices=Status.choices, default=Status.PLANNED)
    start_date = DateTimeField(null=True, blank=True)
    end_date = DateTimeField(null=True, blank=True)
    actual_start_date = DateTimeField(null=True, blank=True)
    actual_end_date = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Project")
        verbose_name_plural = _("Projects")

    def __str__(self) -> str:
        return self.name or str(self.pk)


class Board(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = ForeignKey(Project, on_delete=CASCADE, related_name="boards")
    name = CharField(_("Name"), max_length=255, blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Board")
        verbose_name_plural = _("Boards")

    def __str__(self) -> str:
        return self.name or str(self.pk)


class BoardGroup(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = ForeignKey(Board, on_delete=CASCADE, related_name="groups")
    name = CharField(_("Name"), max_length=255)
    position = models.PositiveIntegerField(default=1)
    wip_limit = models.PositiveIntegerField(default=1)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Board Group")
        verbose_name_plural = _("Board Groups")
        constraints = [
            UniqueConstraint(
                fields=["board", "position"],
                name="uniq_board_group_position",
            ),
        ]
        indexes = [
            models.Index(fields=["board", "position"]),
        ]

    def __str__(self) -> str:
        return self.name


class Task(models.Model):
    class Status(models.TextChoices):
        TODO = "todo", _("Todo")
        IN_PROGRESS = "in_progress", _("In Progress")
        BLOCKED = "blocked", _("Blocked")
        DONE = "done", _("Done")

    class Priority(models.TextChoices):
        LOW = "low", _("Low")
        MEDIUM = "medium", _("Medium")
        HIGH = "high", _("High")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = ForeignKey(Board, on_delete=CASCADE, related_name="tasks")
    group = ForeignKey(BoardGroup, on_delete=CASCADE, related_name="tasks")
    title = CharField(max_length=255)
    description = TextField(blank=True, default="")
    status = CharField(max_length=24, choices=Status.choices, default=Status.TODO)
    priority = CharField(max_length=16, choices=Priority.choices, default=Priority.MEDIUM)
    effort_points = models.PositiveIntegerField(default=1)
    assignee = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    start_date = DateTimeField(null=True, blank=True)
    end_date = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Task")
        verbose_name_plural = _("Tasks")
        indexes = [
            models.Index(fields=["board", "status"]),
            models.Index(fields=["assignee", "status"]),
        ]

    def __str__(self) -> str:
        return self.title


class TaskDependency(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = ForeignKey(Task, on_delete=CASCADE, related_name="dependencies")
    depends_on = ForeignKey(Task, on_delete=CASCADE, related_name="dependents")
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Task Dependency")
        verbose_name_plural = _("Task Dependencies")
        constraints = [
            UniqueConstraint(
                fields=["task", "depends_on"],
                name="uniq_task_dependency",
            ),
        ]


class TaskComment(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = ForeignKey(Task, on_delete=CASCADE, related_name="comments")
    author = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="task_comments",
    )
    content = TextField()
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Task Comment")
        verbose_name_plural = _("Task Comments")


class TaskAttachment(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = ForeignKey(Task, on_delete=CASCADE, related_name="attachments")
    author = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="task_attachments",
    )
    filename = CharField(max_length=255)
    content_type = CharField(max_length=100, blank=True, default="")
    size_bytes = models.PositiveIntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Task Attachment")
        verbose_name_plural = _("Task Attachments")


class TaskActivity(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = ForeignKey(Task, on_delete=CASCADE, related_name="activities")
    actor = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="task_activities",
    )
    event_type = CharField(max_length=64)
    summary = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Task Activity")
        verbose_name_plural = _("Task Activities")
        indexes = [models.Index(fields=["task", "created_at"])]


class TimeLog(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", _("Active")
        PAUSED = "paused", _("Paused")
        COMPLETED = "completed", _("Completed")
        DELETED = "deleted", _("Deleted")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = ForeignKey(Task, on_delete=CASCADE, related_name="time_logs")
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="time_logs",
    )
    status = CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    started_at = DateTimeField()
    current_started_at = DateTimeField(null=True, blank=True)
    ended_at = DateTimeField(null=True, blank=True)
    accumulated_seconds = models.PositiveIntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Time Log")
        verbose_name_plural = _("Time Logs")
        indexes = [
            models.Index(fields=["task", "status"]),
            models.Index(fields=["user", "status"]),
            models.Index(fields=["created_at"]),
        ]


class Notification(models.Model):
    class Type(models.TextChoices):
        ASSIGNED = "task_assigned", _("Task Assigned")
        COMPLETED = "task_completed", _("Task Completed")
        OVERDUE = "task_overdue", _("Task Overdue")
        DUE_SOON = "task_due_soon", _("Task Due Soon")

    class Channel(models.TextChoices):
        IN_APP = "in_app", _("In App")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="notifications",
    )
    task = ForeignKey(
        Task,
        on_delete=CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    type = CharField(max_length=32, choices=Type.choices)
    title = CharField(max_length=255)
    message = TextField(blank=True, default="")
    channel = CharField(max_length=16, choices=Channel.choices, default=Channel.IN_APP)
    metadata = JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Notification")
        verbose_name_plural = _("Notifications")
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"]),
            models.Index(fields=["type", "created_at"]),
            models.Index(fields=["task", "type"]),
        ]


class AuditLog(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = CharField(max_length=64)
    action = CharField(max_length=32, blank=True, default="")
    entity_type = CharField(max_length=64, blank=True, default="")
    entity_id = CharField(max_length=64, blank=True, default="")
    actor = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    workspace = ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    correlation_id = CharField(max_length=64, blank=True, default="")
    before = JSONField(default=dict, blank=True)
    after = JSONField(default=dict, blank=True)
    metadata = JSONField(default=dict, blank=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Audit Log")
        verbose_name_plural = _("Audit Logs")
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
            models.Index(fields=["workspace", "created_at"]),
            models.Index(fields=["correlation_id"]),
        ]


class PermissionAssignment(models.Model):
    """Atribuicao explicita por escopo; no maximo uma linha por (workspace, sujeito, escopo, chave)."""

    class Effect(models.TextChoices):
        ALLOW = "allow", _("Allow")
        DENY = "deny", _("Deny")

    workspace = ForeignKey(Workspace, on_delete=CASCADE, related_name="permission_assignments")
    subject = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="governance_permission_assignments",
    )
    scope_type = CharField(max_length=32)
    scope_id = UUIDField()
    permission_key = CharField(max_length=64)
    effect = CharField(max_length=8, choices=Effect.choices)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Permission assignment")
        verbose_name_plural = _("Permission assignments")
        constraints = [
            UniqueConstraint(
                fields=["workspace", "subject", "scope_type", "scope_id", "permission_key"],
                name="uniq_permission_assignment_scope_key",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "subject"]),
            models.Index(fields=["workspace", "scope_type", "scope_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.subject_id} {self.scope_type}/{self.scope_id} {self.permission_key}"


class PermissionBulkPreview(models.Model):
    """Snapshot de preview para aplicacao em lote (story 1.7); nao altera PermissionAssignment ate apply."""

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        APPLIED = "applied", _("Applied")
        EXPIRED = "expired", _("Expired")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = ForeignKey(Workspace, on_delete=CASCADE, related_name="permission_bulk_previews")
    created_by = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="permission_bulk_previews",
    )
    status = CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    expires_at = DateTimeField()
    items_json = JSONField()
    summary_json = JSONField(null=True, blank=True, default=None)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Permission bulk preview")
        verbose_name_plural = _("Permission bulk previews")

    def __str__(self) -> str:
        return f"bulk-preview {self.pk} ({self.status})"


class PermissionConflictResolution(models.Model):
    """Registro de decisao de conflito aplicada (auditoria)."""

    workspace = ForeignKey(Workspace, on_delete=CASCADE, related_name="conflict_resolutions")
    actor = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="governance_conflict_resolutions",
    )
    option_id = CharField(max_length=64)
    context_summary = TextField(blank=True, default="")
    before_summary = TextField(blank=True, default="")
    after_summary = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Permission conflict resolution")
        verbose_name_plural = _("Permission conflict resolutions")
