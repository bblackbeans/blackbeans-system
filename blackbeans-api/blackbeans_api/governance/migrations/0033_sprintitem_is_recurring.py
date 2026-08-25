from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0032_taskintakedraft_status_priority_due"),
    ]

    operations = [
        migrations.AddField(
            model_name="sprintitem",
            name="is_recurring",
            field=models.BooleanField(default=False),
        ),
    ]
