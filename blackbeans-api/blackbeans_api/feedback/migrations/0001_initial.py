# Generated manually for feedback app

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("governance", "0013_rename_governance__user_id_8f1a2c_idx_governance__user_id_f87410_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProblemReport",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField()),
                ("steps", models.TextField(blank=True, default="")),
                ("source", models.CharField(default="feedback", max_length=32)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("novo", "Novo"),
                            ("em_analise", "Em analise"),
                            ("resolvido", "Resolvido"),
                            ("descartado", "Descartado"),
                        ],
                        default="novo",
                        max_length=32,
                    ),
                ),
                ("url", models.CharField(blank=True, default="", max_length=2048)),
                ("correlation_id", models.CharField(db_index=True, max_length=36)),
                ("context_json", models.JSONField(blank=True, default=dict)),
                ("internal_notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="problem_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="problem_reports",
                        to="governance.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Problem report",
                "verbose_name_plural": "Problem reports",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["status"], name="feedback_pr_status_idx"),
                    models.Index(fields=["created_at"], name="feedback_pr_created_idx"),
                    models.Index(fields=["user"], name="feedback_pr_user_idx"),
                    models.Index(fields=["workspace"], name="feedback_pr_workspace_idx"),
                ],
            },
        ),
    ]
