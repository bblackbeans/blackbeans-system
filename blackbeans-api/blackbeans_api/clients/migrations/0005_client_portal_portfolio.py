# Client portal scope is a portfolio (workspace is linked on Workspace.client).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0004_client_portal_defaults"),
        ("governance", "0038_notification_routing_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="portal_portfolio",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="portal_clients",
                to="governance.portfolio",
            ),
        ),
    ]
