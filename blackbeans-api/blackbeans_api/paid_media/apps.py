from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class PaidMediaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "blackbeans_api.paid_media"
    verbose_name = _("Paid media")

