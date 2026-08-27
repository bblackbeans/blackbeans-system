from django.contrib import admin

from blackbeans_api.integrations.models import IntegrationCredential
from blackbeans_api.integrations.models import IntegrationSettings
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RdSyncJob
from blackbeans_api.integrations.models import RdSyncLog
from blackbeans_api.integrations.models import RdWebhookEvent


@admin.register(IntegrationCredential)
class IntegrationCredentialAdmin(admin.ModelAdmin):
    list_display = ("provider", "connected_at", "access_expires_at", "connected_by")
    readonly_fields = (
        "provider",
        "access_expires_at",
        "connected_at",
        "connected_by",
        "updated_at",
    )
    exclude = ("access_token_encrypted", "refresh_token_encrypted")


@admin.register(IntegrationSettings)
class IntegrationSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "provider",
        "create_deals",
        "pipeline_id",
        "stage_id",
        "min_score_for_deal",
        "webhook_registered",
    )


@admin.register(RdEntityMapping)
class RdEntityMappingAdmin(admin.ModelAdmin):
    list_display = (
        "local_type",
        "local_id",
        "remote_type",
        "remote_id",
        "sync_status",
        "last_synced_at",
    )
    list_filter = ("local_type", "remote_type", "sync_status")
    search_fields = ("remote_id",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(RdSyncJob)
class RdSyncJobAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "total",
        "success_count",
        "error_count",
        "created_at",
    )
    list_filter = ("status",)
    readonly_fields = ("id", "created_at", "started_at", "finished_at")


@admin.register(RdWebhookEvent)
class RdWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("transaction_uuid", "event_type", "status", "created_at")
    list_filter = ("event_type", "status")
    search_fields = ("transaction_uuid",)
    readonly_fields = ("id", "created_at", "processed_at")


@admin.register(RdSyncLog)
class RdSyncLogAdmin(admin.ModelAdmin):
    list_display = ("action", "success", "company_id", "created_at")
    list_filter = ("action", "success")
    readonly_fields = ("id", "created_at")
