from django.apps import AppConfig


class AutomationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "blackbeans_api.automations"
    verbose_name = "Automacoes"

    def ready(self) -> None:
        from blackbeans_api.automations import signals  # noqa: F401
