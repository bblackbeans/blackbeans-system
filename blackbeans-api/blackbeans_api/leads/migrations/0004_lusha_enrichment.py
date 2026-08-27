from django.db import migrations
from django.db import models


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0003_lead_prospect_quality"),
    ]

    operations = [
        migrations.AddField(
            model_name="lead",
            name="job_title",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="lead",
            name="linkedin_url",
            field=models.URLField(blank=True, default="", max_length=512),
        ),
        migrations.AddField(
            model_name="lead",
            name="lusha_contact_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="lead",
            name="lusha_enriched_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="leadcompany",
            name="lusha_company_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="leadcompany",
            name="website_domain",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="leadcompany",
            name="lusha_enriched_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="leadcompany",
            name="lusha_status",
            field=models.CharField(blank=True, db_index=True, default="", max_length=16),
        ),
    ]
