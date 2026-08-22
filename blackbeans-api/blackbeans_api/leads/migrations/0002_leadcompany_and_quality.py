from __future__ import annotations

import uuid

import django.db.models.deletion
from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("leads", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LeadCompany",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(db_index=True, max_length=512)),
                ("name_normalized", models.CharField(blank=True, db_index=True, default="", max_length=512)),
                ("cnpj", models.CharField(blank=True, db_index=True, max_length=14, null=True, unique=True)),
                ("origem", models.CharField(blank=True, db_index=True, default="", max_length=200)),
                (
                    "freshness",
                    models.CharField(
                        choices=[("novo", "Novo"), ("antigo", "Antigo")],
                        db_index=True,
                        default="novo",
                        max_length=16,
                    ),
                ),
                ("has_cnpj", models.BooleanField(db_index=True, default=False)),
                ("has_phone", models.BooleanField(db_index=True, default=False)),
                ("has_email", models.BooleanField(db_index=True, default=False)),
                ("completeness_score", models.PositiveSmallIntegerField(db_index=True, default=0)),
                ("contacts_count", models.PositiveIntegerField(default=0)),
                ("notes", models.TextField(blank=True, default="")),
                ("search_text", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Lead company",
                "verbose_name_plural": "Lead companies",
                "ordering": ["-completeness_score", "name"],
            },
        ),
        migrations.AddIndex(
            model_name="leadcompany",
            index=models.Index(fields=["has_cnpj", "has_phone", "has_email"], name="leads_leadc_has_cnp_7f8a1b_idx"),
        ),
        migrations.AddIndex(
            model_name="leadcompany",
            index=models.Index(fields=["origem", "freshness"], name="leads_leadc_origem_9c2d4e_idx"),
        ),
        migrations.AddIndex(
            model_name="leadcompany",
            index=models.Index(fields=["completeness_score"], name="leads_leadc_complet_1a3b5c_idx"),
        ),
        migrations.AddField(
            model_name="lead",
            name="company",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="contacts",
                to="leads.leadcompany",
            ),
        ),
        migrations.AddField(
            model_name="lead",
            name="email",
            field=models.CharField(blank=True, db_index=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="lead",
            name="phone",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="lead",
            name="cnpj",
            field=models.CharField(blank=True, db_index=True, default="", max_length=14),
        ),
        migrations.AddField(
            model_name="lead",
            name="has_cnpj",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="lead",
            name="has_phone",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="lead",
            name="has_email",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="lead",
            name="completeness_score",
            field=models.PositiveSmallIntegerField(db_index=True, default=0),
        ),
        migrations.AlterField(
            model_name="lead",
            name="import_batch",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="leads",
                to="leads.leadimport",
            ),
        ),
        migrations.AddIndex(
            model_name="lead",
            index=models.Index(fields=["company", "contact_status"], name="leads_lead_company_status_idx"),
        ),
        migrations.AddIndex(
            model_name="lead",
            index=models.Index(fields=["has_cnpj", "has_phone", "has_email"], name="leads_lead_quality_flags_idx"),
        ),
        migrations.AlterModelOptions(
            name="lead",
            options={
                "ordering": ["-completeness_score", "-created_at"],
                "verbose_name": "Lead",
                "verbose_name_plural": "Leads",
            },
        ),
    ]
