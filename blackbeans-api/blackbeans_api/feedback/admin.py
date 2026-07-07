from django.contrib import admin

from blackbeans_api.feedback.models import ProblemReport


@admin.register(ProblemReport)
class ProblemReportAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "user", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("title", "description", "correlation_id")
    readonly_fields = ("id", "correlation_id", "created_at", "updated_at")
