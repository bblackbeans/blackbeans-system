# Atualiza agenda do agente de atrasos para segunda 06:30 America/Sao_Paulo

from django.db import migrations


def update_overdue_agent_schedule(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.filter(slug="overdue_tasks_weekly").update(
        schedule_hint="Toda segunda-feira as 06:30 (America/Sao_Paulo)",
    )

    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return

    weekly, _ = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="6",
        day_of_week="1",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    PeriodicTask.objects.update_or_create(
        name="agent-overdue-tasks-weekly",
        defaults={
            "crontab": weekly,
            "task": "blackbeans_api.governance.tasks.run_overdue_tasks_weekly_agent",
            "kwargs": '{"correlation_id": "celery-beat"}',
            "enabled": True,
        },
    )


def revert_overdue_agent_schedule(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.filter(slug="overdue_tasks_weekly").update(
        schedule_hint="Toda segunda-feira as 08:00 (America/Sao_Paulo)",
    )

    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return

    weekly, _ = CrontabSchedule.objects.get_or_create(
        minute="5",
        hour="8",
        day_of_week="1",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    PeriodicTask.objects.filter(name="agent-overdue-tasks-weekly").update(crontab=weekly)


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0016_agent_definition_run"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(update_overdue_agent_schedule, revert_overdue_agent_schedule),
    ]
