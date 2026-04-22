# Copiar para blackbeans_api/governance/migrations/0002_permission_bulk_preview.py
# (ou correr: sudo chown -R "$USER" governance/migrations && python manage.py makemigrations governance)
# quando a pasta migrations nao for so de leitura.

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0001_initial_rbac"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PermissionBulkPreview",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("applied", "Applied"), ("expired", "Expired")], default="pending", max_length=16)),
                ("expires_at", models.DateTimeField()),
                ("items_json", models.JSONField()),
                ("summary_json", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="permission_bulk_previews",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="permission_bulk_previews",
                        to="governance.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Permission bulk preview",
                "verbose_name_plural": "Permission bulk previews",
            },
        ),
    ]
