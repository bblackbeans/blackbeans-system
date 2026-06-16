import uuid

from django.conf import settings
from django.db import models
from django.db.models import CASCADE
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import DateField
from django.db.models import DecimalField
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


class ServiceCatalog(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = CharField(max_length=255, unique=True)
    description = TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=100)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Service Catalog")
        verbose_name_plural = _("Service Catalog")
        indexes = [models.Index(fields=["is_active", "display_order"])]

    def __str__(self) -> str:
        return self.name


class ClientContract(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        SUBMITTED = "submitted", _("Submitted")
        ACTIVE = "active", _("Active")
        CLOSED = "closed", _("Closed")
        CANCELLED = "cancelled", _("Cancelled")

    class PaymentMethod(models.TextChoices):
        BOLETO = "boleto", _("Boleto")
        TRANSFER = "transfer", _("Transfer")
        PIX = "pix", _("Pix")
        OTHER = "other", _("Other")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = ForeignKey("clients.Client", on_delete=CASCADE, related_name="contracts")
    emits_invoice = models.BooleanField(default=True)
    has_iss_retention = models.BooleanField(default=False)
    has_inss_retention = models.BooleanField(default=False)
    payment_method = CharField(max_length=24, choices=PaymentMethod.choices, default=PaymentMethod.BOLETO)
    payment_other = CharField(max_length=255, blank=True, default="")
    status = CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
    notes = TextField(blank=True, default="")
    created_by = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_contracts",
    )
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Client Contract")
        verbose_name_plural = _("Client Contracts")
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self) -> str:
        return f"{self.client.name} - {self.created_at:%Y-%m-%d}"


class ContractServiceLine(models.Model):
    class ServiceType(models.TextChoices):
        ONE_OFF = "one_off", _("One-off")
        RECURRING = "recurring", _("Recurring")

    class Recurrence(models.TextChoices):
        MONTHLY = "monthly", _("Monthly")
        BIMONTHLY = "bimonthly", _("Bimonthly")
        QUARTERLY = "quarterly", _("Quarterly")
        SEMIANNUAL = "semiannual", _("Semiannual")
        OTHER = "other", _("Other")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = ForeignKey(ClientContract, on_delete=CASCADE, related_name="service_lines")
    service = ForeignKey(ServiceCatalog, on_delete=models.PROTECT, related_name="contract_lines")
    service_type = CharField(max_length=16, choices=ServiceType.choices, default=ServiceType.ONE_OFF)
    recurrence = CharField(max_length=24, choices=Recurrence.choices, blank=True, default="")
    recurrence_other = CharField(max_length=255, blank=True, default="")
    amount = DecimalField(max_digits=12, decimal_places=2)
    starts_on = DateField(null=True, blank=True)
    ends_on = DateField(null=True, blank=True)
    notes = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Contract Service Line")
        verbose_name_plural = _("Contract Service Lines")
        indexes = [models.Index(fields=["service_type", "recurrence"])]

    def __str__(self) -> str:
        return f"{self.contract_id} - {self.service.name}"


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
    contract_line = ForeignKey(
        ContractServiceLine,
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
        COMMENTED = "task_commented", _("Task Commented")
        MENTIONED = "task_mentioned", _("Task Mentioned")
        STATUS_CHANGED = "task_status_changed", _("Task Status Changed")
        PRIORITY_CHANGED = "task_priority_changed", _("Task Priority Changed")
        UPDATED = "task_updated", _("Task Updated")

    class Channel(models.TextChoices):
        IN_APP = "in_app", _("In App")
        EMAIL = "email", _("Email")

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
    actor = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_notifications",
    )
    type = CharField(max_length=32, choices=Type.choices)
    title = CharField(max_length=255)
    message = TextField(blank=True, default="")
    channel = CharField(max_length=16, choices=Channel.choices, default=Channel.IN_APP)
    metadata = JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = DateTimeField(null=True, blank=True)
    email_sent_at = DateTimeField(null=True, blank=True)
    digest_sent_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Notification")
        verbose_name_plural = _("Notifications")
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"]),
            models.Index(fields=["type", "created_at"]),
            models.Index(fields=["task", "type"]),
            models.Index(fields=["user", "email_sent_at"]),
        ]


class NotificationPreference(models.Model):
    class EmailMode(models.TextChoices):
        OFF = "off", _("Off")
        INSTANT = "instant", _("Instant")
        DAILY = "daily", _("Daily Digest")
        WEEKLY = "weekly", _("Weekly Digest")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="notification_preferences",
    )
    event_type = CharField(max_length=32, choices=Notification.Type.choices)
    in_app_enabled = models.BooleanField(default=True)
    email_mode = CharField(max_length=16, choices=EmailMode.choices, default=EmailMode.INSTANT)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Notification Preference")
        verbose_name_plural = _("Notification Preferences")
        constraints = [
            UniqueConstraint(
                fields=["user", "event_type"],
                name="uniq_notification_preference_user_event",
            ),
        ]


class NotificationSubscription(models.Model):
    class TargetType(models.TextChoices):
        TASK = "task", _("Task")
        BOARD = "board", _("Board")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="notification_subscriptions",
    )
    target_type = CharField(max_length=16, choices=TargetType.choices)
    target_id = UUIDField()
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Notification Subscription")
        verbose_name_plural = _("Notification Subscriptions")
        constraints = [
            UniqueConstraint(
                fields=["user", "target_type", "target_id"],
                name="uniq_notification_subscription_target",
            ),
        ]
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
        ]


class NotificationDigestItem(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = ForeignKey(
        Notification,
        on_delete=CASCADE,
        related_name="digest_items",
    )
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="notification_digest_items",
    )
    digest_mode = CharField(
        max_length=16,
        choices=NotificationPreference.EmailMode.choices,
        default=NotificationPreference.EmailMode.DAILY,
    )
    scheduled_for = DateTimeField()
    sent_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Notification Digest Item")
        verbose_name_plural = _("Notification Digest Items")
        indexes = [
            models.Index(fields=["user", "sent_at", "scheduled_for"]),
        ]


class NotificationDeliveryLog(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        SENT = "sent", _("Sent")
        FAILED = "failed", _("Failed")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = ForeignKey(
        Notification,
        on_delete=CASCADE,
        related_name="delivery_logs",
        null=True,
        blank=True,
    )
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="notification_delivery_logs",
    )
    channel = CharField(max_length=16, choices=Notification.Channel.choices)
    status = CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    provider_message_id = CharField(max_length=255, blank=True, default="")
    error = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Notification Delivery Log")
        verbose_name_plural = _("Notification Delivery Logs")
        indexes = [
            models.Index(fields=["user", "channel", "created_at"]),
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
