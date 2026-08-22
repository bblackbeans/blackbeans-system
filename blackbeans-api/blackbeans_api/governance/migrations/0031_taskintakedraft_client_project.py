from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("clients", "0001_initial"),
        ("governance", "0030_sprintitem_client_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="taskintakedraft",
            name="suggested_client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="task_intake_drafts",
                to="clients.client",
            ),
        ),
        migrations.AddField(
            model_name="taskintakedraft",
            name="target_project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="task_intake_drafts",
                to="governance.project",
            ),
        ),
    ]
