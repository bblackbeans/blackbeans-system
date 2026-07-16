# Generated manually for admin autonomous agents (phase 1)

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import uuid


def seed_agents_and_beat(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.update_or_create(
        slug="overdue_tasks_weekly",
        defaults={
            "title": "Tarefas atrasadas (semanal)",
            "description": (
                "Toda segunda-feira, varre tarefas com prazo vencido e status diferente de concluida, "
                "gera um relatorio agregado por projeto/responsavel e notifica administradores."
            ),
            "schedule_hint": "Toda segunda-feira as 09:50 (America/Sao_Paulo)",
            "is_enabled": True,
        },
    )

    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return

    weekly, _ = CrontabSchedule.objects.get_or_create(
        minute="50",
        hour="9",
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


def unseed_agents_and_beat(apps, schema_editor):
    AgentDefinition = apps.get_model("governance", "AgentDefinition")
    AgentDefinition.objects.filter(slug="overdue_tasks_weekly").delete()
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="agent-overdue-tasks-weekly").delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("governance", "0015_taskattachment_file_comment"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AgentDefinition",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("slug", models.CharField(max_length=64, unique=True)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                ("schedule_hint", models.CharField(blank=True, default="", max_length=255)),
                ("is_enabled", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Agent definition",
                "verbose_name_plural": "Agent definitions",
                "ordering": ["title"],
            },
        ),
        migrations.CreateModel(
            name="AgentRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[("running", "Running"), ("success", "Success"), ("failed", "Failed")],
                        default="running",
                        max_length=16,
                    ),
                ),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("summary_text", models.TextField(blank=True, default="")),
                ("report_json", models.JSONField(blank=True, default=dict)),
                ("correlation_id", models.CharField(blank=True, default="", max_length=64)),
                ("error_message", models.TextField(blank=True, default="")),
                (
                    "agent",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="runs",
                        to="governance.agentdefinition",
                    ),
                ),
                (
                    "triggered_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="agent_runs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Agent run",
                "verbose_name_plural": "Agent runs",
                "ordering": ["-started_at"],
            },
        ),
        migrations.AddIndex(
            model_name="agentrun",
            index=models.Index(fields=["agent", "started_at"], name="governance__agent_i_7a1b2c_idx"),
        ),
        migrations.AddIndex(
            model_name="agentrun",
            index=models.Index(fields=["status", "started_at"], name="governance__status_8d3e4f_idx"),
        ),
        migrations.RunPython(seed_agents_and_beat, unseed_agents_and_beat),
    ]
