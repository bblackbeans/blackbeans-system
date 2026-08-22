from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0031_taskintakedraft_client_project"),
    ]

    operations = [
        migrations.AddField(
            model_name="taskintakedraft",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="taskintakedraft",
            name="priority",
            field=models.CharField(blank=True, default="medium", max_length=16),
        ),
        migrations.AddField(
            model_name="taskintakedraft",
            name="task_status",
            field=models.CharField(blank=True, default="todo", max_length=64),
        ),
    ]
