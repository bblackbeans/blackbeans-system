import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0001_initial"),
        ("governance", "0025_clientrequestattachment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TaskIntakeBatch",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("filename", models.CharField(blank=True, default="", max_length=512)),
                ("ata_file", models.FileField(blank=True, null=True, upload_to="task_intake/%Y/%m/")),
                ("extracted_text", models.TextField(blank=True, default="")),
                ("suggested_client_name", models.CharField(blank=True, default="", max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending_review", "Pending review"),
                            ("converted", "Converted"),
                            ("discarded", "Discarded"),
                        ],
                        default="pending_review",
                        max_length=24,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "converted_project",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_intake_batches",
                        to="governance.project",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_intake_batches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "suggested_client",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_intake_batches",
                        to="clients.client",
                    ),
                ),
            ],
            options={
                "verbose_name": "Task intake batch",
                "verbose_name_plural": "Task intake batches",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="TaskIntakeDraft",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                ("assignee_hint", models.CharField(blank=True, default="", max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("discarded", "Discarded"),
                            ("converted", "Converted"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("position", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "batch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="drafts",
                        to="governance.taskintakebatch",
                    ),
                ),
                (
                    "converted_task",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="source_intake_drafts",
                        to="governance.task",
                    ),
                ),
                (
                    "suggested_assignee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_intake_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Task intake draft",
                "verbose_name_plural": "Task intake drafts",
                "ordering": ["position", "created_at"],
            },
        ),
        migrations.CreateModel(
            name="SprintWeek",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("week_start", models.DateField(db_index=True)),
                ("week_end", models.DateField(db_index=True)),
                ("locked_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "locked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="locked_sprints",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Sprint week",
                "verbose_name_plural": "Sprint weeks",
                "ordering": ["-week_start"],
            },
        ),
        migrations.AddConstraint(
            model_name="sprintweek",
            constraint=models.UniqueConstraint(fields=("week_start", "week_end"), name="uniq_sprint_week_range"),
        ),
        migrations.CreateModel(
            name="SprintItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=255)),
                ("status", models.CharField(blank=True, default="", max_length=64)),
                ("start_date", models.DateTimeField(blank=True, null=True)),
                ("end_date", models.DateTimeField(blank=True, null=True)),
                ("effort_points", models.PositiveIntegerField(default=0)),
                ("hours_logged", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ("project_name", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "assignee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="sprint_items",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "sprint",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="governance.sprintweek",
                    ),
                ),
                (
                    "task",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="sprint_items",
                        to="governance.task",
                    ),
                ),
            ],
            options={
                "verbose_name": "Sprint item",
                "verbose_name_plural": "Sprint items",
                "ordering": ["assignee_id", "end_date", "title"],
            },
        ),
        migrations.AddIndex(
            model_name="sprintitem",
            index=models.Index(fields=["sprint", "assignee"], name="sprint_item_assignee_idx"),
        ),
    ]
