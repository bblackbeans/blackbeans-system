# Generated manually for public client request attachments

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0024_vivid_task_status_colors"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientRequestAttachment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "kind",
                    models.CharField(
                        choices=[("image", "Image"), ("file", "File"), ("audio", "Audio")],
                        default="file",
                        max_length=16,
                    ),
                ),
                ("filename", models.CharField(max_length=255)),
                ("content_type", models.CharField(blank=True, default="", max_length=100)),
                ("size_bytes", models.PositiveIntegerField(default=0)),
                ("file", models.FileField(upload_to="client_request_attachments/%Y/%m/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "client_request",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="governance.clientrequest",
                    ),
                ),
            ],
            options={
                "verbose_name": "Client request attachment",
                "verbose_name_plural": "Client request attachments",
                "ordering": ["created_at"],
            },
        ),
    ]
