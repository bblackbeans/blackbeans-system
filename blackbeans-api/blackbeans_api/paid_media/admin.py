from django.contrib import admin

from blackbeans_api.paid_media.models import MetaAdAccountLink
from blackbeans_api.paid_media.models import PaidMediaConnection


@admin.register(PaidMediaConnection)
class PaidMediaConnectionAdmin(admin.ModelAdmin):
    list_display = ("workspace", "provider", "is_active", "created_at")
    list_filter = ("provider", "is_active")
    search_fields = ("workspace__name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MetaAdAccountLink)
class MetaAdAccountLinkAdmin(admin.ModelAdmin):
    list_display = (
        "external_account_id",
        "display_name",
        "workspace",
        "client",
        "is_active",
    )
    list_filter = ("is_active", "workspace", "client")
    search_fields = (
        "external_account_id",
        "display_name",
        "workspace__name",
        "client__name",
    )
    readonly_fields = ("id", "created_at", "updated_at")

