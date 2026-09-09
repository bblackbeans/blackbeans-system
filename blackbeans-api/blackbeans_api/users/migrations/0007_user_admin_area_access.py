# Generated manually for UserAdminAreaAccess

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0006_user_avatar"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserAdminAreaAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("area_key", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="admin_area_access_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "User admin area access",
                "verbose_name_plural": "User admin area accesses",
            },
        ),
        migrations.AddConstraint(
            model_name="useradminareaaccess",
            constraint=models.UniqueConstraint(fields=("user", "area_key"), name="uniq_user_admin_area_access"),
        ),
    ]
