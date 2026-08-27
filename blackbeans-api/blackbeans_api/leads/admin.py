from django.contrib import admin

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.models import LeadImport


@admin.register(LeadImport)
class LeadImportAdmin(admin.ModelAdmin):
    list_display = ("origem", "freshness", "row_count", "filename", "created_at")
    list_filter = ("freshness", "origem", "created_at")
    search_fields = ("origem", "filename")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(LeadCompany)
class LeadCompanyAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "cnpj",
        "origem",
        "freshness",
        "contacts_count",
        "completeness_score",
        "has_cnpj",
        "has_phone",
        "has_email",
    )
    list_filter = (
        "freshness",
        "has_cnpj",
        "has_phone",
        "has_email",
        "contact_is_decision_maker",
        "email_is_generic",
        "phone_is_shared",
        "origem",
    )
    search_fields = ("name", "cnpj", "search_text", "notes", "website_domain")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "name_normalized",
        "search_text",
        "website_domain",
    )


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "job_title",
        "company",
        "contact_status",
        "completeness_score",
        "has_cnpj",
        "has_phone",
        "has_email",
        "import_batch",
        "created_at",
    )
    list_filter = (
        "contact_status",
        "has_cnpj",
        "has_phone",
        "has_email",
        "contact_is_decision_maker",
        "email_is_generic",
        "phone_is_shared",
        "created_at",
    )
    search_fields = (
        "display_name",
        "job_title",
        "search_text",
        "notes",
        "email",
        "phone",
        "cnpj",
    )
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "linkedin_url",
    )
    raw_id_fields = ("company", "import_batch")
