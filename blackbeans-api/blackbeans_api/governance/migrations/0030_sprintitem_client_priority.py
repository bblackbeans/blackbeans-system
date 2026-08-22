from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0029_board_pull_status_keys"),
    ]

    operations = [
        migrations.AddField(
            model_name="sprintitem",
            name="client_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="sprintitem",
            name="priority",
            field=models.CharField(blank=True, default="", max_length=24),
        ),
    ]
