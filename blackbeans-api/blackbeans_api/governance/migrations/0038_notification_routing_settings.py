# Generated manually for NotificationRoutingSettings

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0037_task_number_archive_hours_overdue"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationRoutingSettings",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("completion_recipient_ids", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Notification Routing Settings",
                "verbose_name_plural": "Notification Routing Settings",
            },
        ),
    ]
