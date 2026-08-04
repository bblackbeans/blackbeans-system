# Phase C: task recurrence + client requests

import uuid

from django.conf import settings
from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0020_phase_a_timelog_status_catalog"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="is_recurring",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="task",
            name="recurrence_frequency",
            field=models.CharField(blank=True, default="", help_text="daily|weekly|biweekly|monthly", max_length=16),
        ),
        migrations.AddField(
            model_name="task",
            name="recurrence_anchor_task",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="recurrence_children",
                to="governance.task",
            ),
        ),
        migrations.CreateModel(
            name="ClientRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_name", models.CharField(max_length=255)),
                ("contact_name", models.CharField(blank=True, default="", max_length=255)),
                ("contact_email", models.CharField(blank=True, default="", max_length=255)),
                ("contact_phone", models.CharField(blank=True, default="", max_length=64)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("in_review", "In Review"),
                            ("converted", "Converted"),
                            ("rejected", "Rejected"),
                        ],
                        default="new",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "converted_project",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="client_requests",
                        to="governance.project",
                    ),
                ),
                (
                    "converted_task",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="source_client_requests",
                        to="governance.task",
                    ),
                ),
            ],
            options={
                "verbose_name": "Client request",
                "verbose_name_plural": "Client requests",
                "ordering": ["-created_at"],
            },
        ),
    ]
