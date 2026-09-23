# Task number, archive, project hours, overdue status, client request metadata

from django.db import migrations, models


def seed_overdue_status(apps, schema_editor):
    TaskStatusDefinition = apps.get_model("governance", "TaskStatusDefinition")
    TaskStatusDefinition.objects.update_or_create(
        key="overdue",
        defaults={
            "label": "Atrasada",
            "color": "volcano",
            "is_done_like": False,
            "position": 5,
            "is_active": True,
        },
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0036_clientrequest_client_review"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="project",
            name="planned_hours",
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="project",
            name="planned_cost",
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="project",
            name="monthly_contracted_hours",
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="task",
            name="number",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="task",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="clientrequest",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddIndex(
            model_name="task",
            index=models.Index(fields=["board", "number"], name="governance__board_i_number_idx"),
        ),
        migrations.AddIndex(
            model_name="task",
            index=models.Index(fields=["archived_at"], name="governance__archive_task_idx"),
        ),
        migrations.RunPython(seed_overdue_status, noop_reverse),
    ]
