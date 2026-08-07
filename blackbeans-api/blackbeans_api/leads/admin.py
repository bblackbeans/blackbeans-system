from django.contrib import admin

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadImport


@admin.register(LeadImport)
class LeadImportAdmin(admin.ModelAdmin):
    list_display = ("origem", "freshness", "row_count", "filename", "created_at")
    list_filter = ("freshness", "origem", "created_at")
    search_fields = ("origem", "filename")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("display_name", "contact_status", "import_batch", "created_at")
    list_filter = ("contact_status", "created_at")
    search_fields = ("display_name", "search_text", "notes")
    readonly_fields = ("id", "created_at", "updated_at")
