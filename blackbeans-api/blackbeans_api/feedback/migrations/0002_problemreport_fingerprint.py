# Generated manually for auto_error fingerprint dedupe

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("feedback", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="problemreport",
            name="fingerprint",
            field=models.CharField(blank=True, db_index=True, default="", max_length=255),
        ),
        migrations.AddIndex(
            model_name="problemreport",
            index=models.Index(
                fields=["fingerprint", "user", "created_at"],
                name="feedback_pr_fingerp_7c2a1b_idx",
            ),
        ),
    ]
