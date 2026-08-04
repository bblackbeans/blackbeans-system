from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0022_time_play_cutoff_recurrence_beat"),
    ]

    operations = [
        migrations.AlterField(
            model_name="task",
            name="priority",
            field=models.CharField(
                choices=[
                    ("low", "Low"),
                    ("medium", "Medium"),
                    ("high", "High"),
                    ("critical", "Critical"),
                ],
                default="medium",
                max_length=16,
            ),
        ),
    ]
