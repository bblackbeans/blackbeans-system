from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import SET_NULL
from django.db.models import JSONField
from django.db.models import Q
from django.utils.translation import gettext_lazy as _


class Provider(models.TextChoices):
    RD_STATION_CRM = "rd_station_crm", _("RD Station CRM")


class LocalType(models.TextChoices):
    COMPANY = "company", _("Company")
    CONTACT = "contact", _("Contact")
    DEAL = "deal", _("Deal")


class RemoteType(models.TextChoices):
    ORGANIZATION = "organization", _("Organization")
    CONTACT = "contact", _("Contact")
    DEAL = "deal", _("Deal")


class SyncStatus(models.TextChoices):
    SYNCING = "syncing", _("Syncing")
    SYNCED = "synced", _("Synced")
    PENDING_UPDATE = "pending_update", _("Pending update")
    ERROR = "error", _("Error")


class JobStatus(models.TextChoices):
    QUEUED = "queued", _("Queued")
    RUNNING = "running", _("Running")
    DONE = "done", _("Done")
    FAILED = "failed", _("Failed")


class JobItemStatus(models.TextChoices):
    PENDING = "pending", _("Pending")
    SYNCING = "syncing", _("Syncing")
    SYNCED = "synced", _("Synced")
    ERROR = "error", _("Error")
    SKIPPED = "skipped", _("Skipped")


class WebhookEventStatus(models.TextChoices):
    RECEIVED = "received", _("Received")
    PROCESSED = "processed", _("Processed")
    IGNORED = "ignored", _("Ignored")
    ERROR = "error", _("Error")


def default_legal_bases():
    return [
        {
            "category": "communications",
            "type": "legitimate_interest",
            "status": "granted",
        },
    ]


class IntegrationCredential(models.Model):
    provider = models.CharField(
        max_length=32,
        choices=Provider.choices,
        unique=True,
    )
    access_token_encrypted = models.TextField(blank=True, default="")
    refresh_token_encrypted = models.TextField(blank=True, default="")
    access_expires_at = models.DateTimeField(null=True, blank=True)
    connected_at = models.DateTimeField(null=True, blank=True)
    connected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="integration_credentials",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Integration credential")
        verbose_name_plural = _("Integration credentials")

    def __str__(self) -> str:
        return self.provider


class IntegrationSettings(models.Model):
    provider = models.CharField(
        max_length=32,
        choices=Provider.choices,
        unique=True,
    )
    create_deals = models.BooleanField(default=False)
    pipeline_id = models.CharField(max_length=24, blank=True, default="")
    stage_id = models.CharField(max_length=24, blank=True, default="")
    owner_id = models.CharField(max_length=24, blank=True, default="")
    source_id = models.CharField(max_length=24, blank=True, default="")
    min_score_for_deal = models.PositiveSmallIntegerField(default=0)
    only_contacts_with_email_or_phone = models.BooleanField(default=True)
    cnpj_custom_field_slug = models.CharField(max_length=80, blank=True, default="cnpj")
    legal_bases = JSONField(default=default_legal_bases, blank=True)
    webhook_secret = models.CharField(max_length=128, blank=True, default="")
    webhook_header_name = models.CharField(
        max_length=64,
        blank=True,
        default="X-BlackBeans-RD",
    )
    webhook_registered = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Integration settings")
        verbose_name_plural = _("Integration settings")

    def __str__(self) -> str:
        return self.provider


class IntegrationOAuthState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=32, choices=Provider.choices, db_index=True)
    state = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="integration_oauth_states",
    )
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("OAuth state")
        verbose_name_plural = _("OAuth states")
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self) -> str:
        return self.state


class RdEntityMapping(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(
        max_length=32,
        choices=Provider.choices,
        default=Provider.RD_STATION_CRM,
        db_index=True,
    )
    local_type = models.CharField(
        max_length=16, choices=LocalType.choices, db_index=True,
    )
    local_id = models.UUIDField(db_index=True)
    remote_type = models.CharField(
        max_length=16, choices=RemoteType.choices, db_index=True,
    )
    remote_id = models.CharField(max_length=24, blank=True, default="", db_index=True)
    sync_status = models.CharField(
        max_length=16,
        choices=SyncStatus.choices,
        default=SyncStatus.SYNCING,
        db_index=True,
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    metadata = JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("RD entity mapping")
        verbose_name_plural = _("RD entity mappings")
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "local_type", "local_id"],
                name="integrations_rdmap_local_uniq",
            ),
            models.UniqueConstraint(
                fields=["provider", "remote_type", "remote_id"],
                condition=~Q(remote_id=""),
                name="integrations_rdmap_remote_uniq",
            ),
        ]
        indexes = [
            models.Index(fields=["provider", "sync_status"]),
            models.Index(fields=["provider", "local_type", "sync_status"]),
        ]

    def __str__(self) -> str:
        return f"{self.local_type}:{self.local_id} -> {self.remote_id}"


class RdSyncJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(
        max_length=16,
        choices=JobStatus.choices,
        default=JobStatus.QUEUED,
        db_index=True,
    )
    filter_snapshot = JSONField(default=dict, blank=True)
    select_all_matching = models.BooleanField(default=False)
    force_resync = models.BooleanField(default=False)
    create_deals_snapshot = models.BooleanField(default=False)
    total = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="rd_sync_jobs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("RD sync job")
        verbose_name_plural = _("RD sync jobs")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.status} ({self.total})"

    @property
    def done_count(self) -> int:
        return self.success_count + self.error_count + self.skipped_count


class RdSyncJobItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(
        RdSyncJob,
        on_delete=models.CASCADE,
        related_name="items",
    )
    company_id = models.UUIDField(db_index=True)
    status = models.CharField(
        max_length=16,
        choices=JobItemStatus.choices,
        default=JobItemStatus.PENDING,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("RD sync job item")
        verbose_name_plural = _("RD sync job items")
        constraints = [
            models.UniqueConstraint(
                fields=["job", "company_id"],
                name="integrations_rdjobitem_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.company_id} ({self.status})"


class RdWebhookEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction_uuid = models.CharField(max_length=64, unique=True)
    event_type = models.CharField(max_length=64, db_index=True)
    payload = JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=WebhookEventStatus.choices,
        default=WebhookEventStatus.RECEIVED,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("RD webhook event")
        verbose_name_plural = _("RD webhook events")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.event_type}:{self.transaction_uuid}"


class RdSyncLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company_id = models.UUIDField(null=True, blank=True, db_index=True)
    job = models.ForeignKey(
        RdSyncJob,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    action = models.CharField(max_length=64, db_index=True)
    success = models.BooleanField(default=True)
    message = models.TextField(blank=True, default="")
    extra = JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("RD sync log")
        verbose_name_plural = _("RD sync logs")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company_id", "created_at"])]

    def __str__(self) -> str:
        return self.action
