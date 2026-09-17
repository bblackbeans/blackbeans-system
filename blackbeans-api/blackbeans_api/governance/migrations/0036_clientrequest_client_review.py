# Client review fields on ClientRequest

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0035_clientrequest_client"),
    ]

    operations = [
        migrations.AddField(
            model_name="clientrequest",
            name="client_review_status",
            field=models.CharField(
                blank=True,
                default="none",
                help_text="none|awaiting_client|approved|revision_requested",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="clientrequest",
            name="client_revision_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="clientrequest",
            name="client_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
