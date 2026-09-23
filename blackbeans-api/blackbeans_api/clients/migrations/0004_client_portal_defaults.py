# Client portal default project/board

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0003_client_portal_credentials"),
        ("governance", "0037_task_number_archive_hours_overdue"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="portal_default_project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="portal_default_for_clients",
                to="governance.project",
            ),
        ),
        migrations.AddField(
            model_name="client",
            name="portal_default_board",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="portal_default_for_clients",
                to="governance.board",
            ),
        ),
    ]
