from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0033_sprintitem_is_recurring"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="always_in_sprint",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="sprintitem",
            name="always_in_sprint",
            field=models.BooleanField(default=False),
        ),
    ]
