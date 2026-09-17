# Generated manually for ClientRequest.client FK

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0003_client_portal_credentials"),
        ("governance", "0034_task_always_in_sprint"),
    ]

    operations = [
        migrations.AddField(
            model_name="clientrequest",
            name="client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="requests",
                to="clients.client",
            ),
        ),
    ]
