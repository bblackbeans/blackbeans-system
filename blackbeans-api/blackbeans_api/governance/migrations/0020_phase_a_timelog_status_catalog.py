# Phase A: TimeLog manual fields + TaskStatusDefinition catalog + Task.status freeform

import uuid

from django.db import migrations
from django.db import models


def seed_task_status_definitions(apps, schema_editor):
    TaskStatusDefinition = apps.get_model("governance", "TaskStatusDefinition")
    defaults = [
        {"key": "todo", "label": "A fazer", "color": "#94a3b8", "is_done_like": False, "position": 1},
        {"key": "in_progress", "label": "Em andamento", "color": "#3b82f6", "is_done_like": False, "position": 2},
        {"key": "blocked", "label": "Bloqueada", "color": "#ef4444", "is_done_like": False, "position": 3},
        {"key": "done", "label": "Concluida", "color": "#22c55e", "is_done_like": True, "position": 4},
    ]
    for item in defaults:
        TaskStatusDefinition.objects.update_or_create(
            key=item["key"],
            defaults={
                "label": item["label"],
                "color": item["color"],
                "is_done_like": item["is_done_like"],
                "position": item["position"],
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0019_agent_blocked_stale"),
    ]

    operations = [
        migrations.AddField(
            model_name="timelog",
            name="is_manual",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="timelog",
            name="source",
            field=models.CharField(default="timer", max_length=16),
        ),
        migrations.CreateModel(
            name="TaskStatusDefinition",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.CharField(max_length=64, unique=True, verbose_name="Key")),
                ("label", models.CharField(max_length=255, verbose_name="Label")),
                ("color", models.CharField(blank=True, default="", max_length=32, verbose_name="Color")),
                ("is_done_like", models.BooleanField(default=False)),
                ("position", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Task Status Definition",
                "verbose_name_plural": "Task Status Definitions",
                "ordering": ["position", "key"],
                "indexes": [
                    models.Index(fields=["is_active", "position"], name="governance__is_acti_status_idx"),
                ],
            },
        ),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(default="todo", max_length=64),
        ),
        migrations.RunPython(seed_task_status_definitions, migrations.RunPython.noop),
    ]
