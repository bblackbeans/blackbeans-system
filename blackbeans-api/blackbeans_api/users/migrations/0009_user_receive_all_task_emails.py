from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_user_api_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="receive_all_task_emails",
            field=models.BooleanField(
                default=False,
                help_text="When enabled for staff, receive report emails for all tasks.",
                verbose_name="Receive all task report emails",
            ),
        ),
    ]
