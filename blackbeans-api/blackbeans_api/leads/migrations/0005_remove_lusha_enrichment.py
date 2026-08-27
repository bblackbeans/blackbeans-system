from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("leads", "0004_lusha_enrichment"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="lead",
            name="lusha_contact_id",
        ),
        migrations.RemoveField(
            model_name="lead",
            name="lusha_enriched_at",
        ),
        migrations.RemoveField(
            model_name="leadcompany",
            name="lusha_company_id",
        ),
        migrations.RemoveField(
            model_name="leadcompany",
            name="lusha_enriched_at",
        ),
        migrations.RemoveField(
            model_name="leadcompany",
            name="lusha_status",
        ),
    ]
