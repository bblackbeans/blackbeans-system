# Generated manually for UserApiToken

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_user_admin_area_access"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserApiToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120, verbose_name="Name")),
                ("token_prefix", models.CharField(max_length=16)),
                ("token_hash", models.CharField(db_index=True, max_length=64, unique=True)),
                ("scopes", models.JSONField(blank=True, default=list)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="api_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "User API token",
                "verbose_name_plural": "User API tokens",
                "ordering": ["-created_at"],
            },
        ),
    ]
