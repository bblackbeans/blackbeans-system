# Generated manually for client portal credentials

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0002_client_cnpj_client_contact_name_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="portal_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="client",
            name="portal_password_hash",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="client",
            name="portal_username",
            field=models.CharField(blank=True, max_length=150, null=True, unique=True),
        ),
    ]
