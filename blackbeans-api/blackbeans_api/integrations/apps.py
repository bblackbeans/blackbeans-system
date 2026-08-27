from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class IntegrationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "blackbeans_api.integrations"
    verbose_name = _("Integrations")
    default = True

    def ready(self):
        from blackbeans_api.integrations import signals  # noqa: PLC0415

        signals.connect_signals()
