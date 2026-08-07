from __future__ import annotations

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LeadImport",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("origem", models.CharField(db_index=True, max_length=200)),
                (
                    "freshness",
                    models.CharField(
                        choices=[("novo", "Novo"), ("antigo", "Antigo")],
                        db_index=True,
                        default="novo",
                        max_length=16,
                    ),
                ),
                ("filename", models.CharField(blank=True, default="", max_length=512)),
                ("column_keys", models.JSONField(blank=True, default=list)),
                ("row_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lead_imports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Lead import",
                "verbose_name_plural": "Lead imports",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="Lead",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("display_name", models.CharField(blank=True, db_index=True, default="", max_length=512)),
                ("search_text", models.TextField(blank=True, default="")),
                (
                    "contact_status",
                    models.CharField(
                        choices=[
                            ("nao_contatado", "Nao contatado"),
                            ("em_contato", "Em contato"),
                            ("contatado", "Contatado"),
                            ("sem_interesse", "Sem interesse"),
                        ],
                        db_index=True,
                        default="nao_contatado",
                        max_length=32,
                    ),
                ),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "import_batch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="leads",
                        to="leads.leadimport",
                    ),
                ),
            ],
            options={
                "verbose_name": "Lead",
                "verbose_name_plural": "Leads",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="leadimport",
            index=models.Index(fields=["origem", "freshness"], name="leads_leadi_origem_7a2c1d_idx"),
        ),
        migrations.AddIndex(
            model_name="leadimport",
            index=models.Index(fields=["created_at"], name="leads_leadi_created_8f4e2a_idx"),
        ),
        migrations.AddIndex(
            model_name="lead",
            index=models.Index(fields=["contact_status"], name="leads_lead_contact_1b3c4d_idx"),
        ),
        migrations.AddIndex(
            model_name="lead",
            index=models.Index(fields=["display_name"], name="leads_lead_display_5e6f7a_idx"),
        ),
        migrations.AddIndex(
            model_name="lead",
            index=models.Index(
                fields=["import_batch", "contact_status"],
                name="leads_lead_import__9a8b7c_idx",
            ),
        ),
    ]
