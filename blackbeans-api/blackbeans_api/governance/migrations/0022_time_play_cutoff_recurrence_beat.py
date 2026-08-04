# Seed agente time_play_cutoff + PeriodicTask de recorrencia

from django.db import migrations


def seed_cutoff_and_recurrence(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.update_or_create(
        slug="time_play_cutoff",
        defaults={
            "title": "Bloqueio de play apos horario",
            "description": (
                "Regra operacional: rejeita POST /tasks/{id}/time/start apos o horario "
                "configurado (TIME_PLAY_CUTOFF_HOUR, default 18:00 America/Sao_Paulo)."
            ),
            "schedule_hint": "Continuo (no play). Default: apos 18:00 America/Sao_Paulo",
            "is_enabled": True,
        },
    )
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    daily, _ = CrontabSchedule.objects.get_or_create(
        minute="15",
        hour="6",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    PeriodicTask.objects.update_or_create(
        name="spawn-due-recurring-tasks-daily",
        defaults={
            "crontab": daily,
            "task": "blackbeans_api.governance.tasks.spawn_due_recurring_tasks",
            "enabled": True,
        },
    )


def unseed_cutoff_and_recurrence(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    AgentDefinition.objects.filter(slug="time_play_cutoff").delete()
    PeriodicTask.objects.filter(name="spawn-due-recurring-tasks-daily").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0021_task_recurrence_client_request"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_cutoff_and_recurrence, unseed_cutoff_and_recurrence),
    ]
