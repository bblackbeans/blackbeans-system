# Generated manually for UserWorkspaceAccess

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0008_auditlog"),
        ("users", "0004_user_totp_enabled_user_totp_pending_secret_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserWorkspaceAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_access_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_access_entries",
                        to="governance.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "User workspace access",
                "verbose_name_plural": "User workspace accesses",
            },
        ),
        migrations.AddConstraint(
            model_name="userworkspaceaccess",
            constraint=models.UniqueConstraint(fields=("user", "workspace"), name="uniq_user_workspace_access"),
        ),
    ]
