# Seed do agente blocked_stale_tasks + PeriodicTask diario 10:00 America/Sao_Paulo

from django.db import migrations


def seed_blocked_stale_agent(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.update_or_create(
        slug="blocked_stale_tasks",
        defaults={
            "title": "Detector de bloqueio (diario)",
            "description": (
                "Identifica tarefas blocked ou sem movimento ha 7 dias, "
                "gera briefing (IA ou fallback) e notifica administradores."
            ),
            "schedule_hint": "Todo dia as 10:00 (America/Sao_Paulo)",
            "is_enabled": True,
        },
    )
    # Atualiza descricao do agente de atrasos para mencionar briefing IA
    AgentDefinition.objects.filter(slug="overdue_tasks_weekly").update(
        description=(
            "Varre tarefas com prazo vencido, gera briefing (IA ou fallback) "
            "e notifica administradores."
        ),
    )

    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return

    daily, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="10",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    PeriodicTask.objects.update_or_create(
        name="agent-blocked-stale-tasks-daily",
        defaults={
            "crontab": daily,
            "task": "blackbeans_api.governance.tasks.run_blocked_stale_tasks_agent",
            "kwargs": '{"correlation_id": "celery-beat"}',
            "enabled": True,
        },
    )


def unseed_blocked_stale_agent(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.filter(slug="blocked_stale_tasks").delete()
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="agent-blocked-stale-tasks-daily").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0018_agent_overdue_schedule_0950"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_blocked_stale_agent, unseed_blocked_stale_agent),
    ]
