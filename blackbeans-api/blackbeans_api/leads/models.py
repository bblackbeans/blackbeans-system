from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import CASCADE
from django.db.models import SET_NULL
from django.db.models import JSONField
from django.utils.translation import gettext_lazy as _


class LeadImport(models.Model):
    class Freshness(models.TextChoices):
        NOVO = "novo", _("Novo")
        ANTIGO = "antigo", _("Antigo")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    origem = models.CharField(max_length=200, db_index=True)
    freshness = models.CharField(
        max_length=16,
        choices=Freshness.choices,
        default=Freshness.NOVO,
        db_index=True,
    )
    filename = models.CharField(max_length=512, blank=True, default="")
    column_keys = JSONField(default=list, blank=True)
    row_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="lead_imports",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Lead import")
        verbose_name_plural = _("Lead imports")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["origem", "freshness"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.origem} ({self.freshness}) — {self.row_count} leads"


class LeadCompany(models.Model):
    class Freshness(models.TextChoices):
        NOVO = "novo", _("Novo")
        ANTIGO = "antigo", _("Antigo")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=512, db_index=True)
    name_normalized = models.CharField(max_length=512, blank=True, default="", db_index=True)
    cnpj = models.CharField(max_length=14, blank=True, null=True, unique=True, db_index=True)
    origem = models.CharField(max_length=200, blank=True, default="", db_index=True)
    freshness = models.CharField(
        max_length=16,
        choices=Freshness.choices,
        default=Freshness.NOVO,
        db_index=True,
    )
    has_cnpj = models.BooleanField(default=False, db_index=True)
    has_phone = models.BooleanField(default=False, db_index=True)
    has_email = models.BooleanField(default=False, db_index=True)
    completeness_score = models.PositiveSmallIntegerField(default=0, db_index=True)
    email_is_generic = models.BooleanField(default=False, db_index=True)
    email_is_shared = models.BooleanField(default=False, db_index=True)
    phone_is_shared = models.BooleanField(default=False, db_index=True)
    contact_is_person = models.BooleanField(default=False, db_index=True)
    contact_is_decision_maker = models.BooleanField(default=False, db_index=True)
    website_domain = models.CharField(max_length=255, blank=True, default="")
    contacts_count = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    search_text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Lead company")
        verbose_name_plural = _("Lead companies")
        ordering = ["-completeness_score", "name"]
        indexes = [
            models.Index(fields=["has_cnpj", "has_phone", "has_email"]),
            models.Index(fields=["origem", "freshness"]),
            models.Index(fields=["completeness_score"]),
            models.Index(
                fields=["contact_is_decision_maker", "email_is_generic", "phone_is_shared"],
                name="leads_leadc_prospect_idx",
            ),
        ]

    def __str__(self) -> str:
        return self.name or str(self.pk)


class Lead(models.Model):
    class ContactStatus(models.TextChoices):
        NAO_CONTATADO = "nao_contatado", _("Nao contatado")
        EM_CONTATO = "em_contato", _("Em contato")
        CONTATADO = "contatado", _("Contatado")
        SEM_INTERESSE = "sem_interesse", _("Sem interesse")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_batch = models.ForeignKey(
        LeadImport,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
    )
    company = models.ForeignKey(
        LeadCompany,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="contacts",
    )
    payload = JSONField(default=dict, blank=True)
    display_name = models.CharField(max_length=512, blank=True, default="", db_index=True)
    email = models.CharField(max_length=255, blank=True, default="", db_index=True)
    phone = models.CharField(max_length=64, blank=True, default="", db_index=True)
    cnpj = models.CharField(max_length=14, blank=True, default="", db_index=True)
    has_cnpj = models.BooleanField(default=False, db_index=True)
    has_phone = models.BooleanField(default=False, db_index=True)
    has_email = models.BooleanField(default=False, db_index=True)
    completeness_score = models.PositiveSmallIntegerField(default=0, db_index=True)
    email_is_generic = models.BooleanField(default=False, db_index=True)
    email_is_shared = models.BooleanField(default=False, db_index=True)
    phone_is_shared = models.BooleanField(default=False, db_index=True)
    contact_is_person = models.BooleanField(default=False, db_index=True)
    contact_is_decision_maker = models.BooleanField(default=False, db_index=True)
    search_text = models.TextField(blank=True, default="")
    contact_status = models.CharField(
        max_length=32,
        choices=ContactStatus.choices,
        default=ContactStatus.NAO_CONTATADO,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    job_title = models.CharField(max_length=120, blank=True, default="")
    linkedin_url = models.URLField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Lead")
        verbose_name_plural = _("Leads")
        ordering = ["-completeness_score", "-created_at"]
        indexes = [
            models.Index(fields=["contact_status"]),
            models.Index(fields=["display_name"]),
            models.Index(fields=["import_batch", "contact_status"]),
            models.Index(fields=["company", "contact_status"]),
            models.Index(fields=["has_cnpj", "has_phone", "has_email"]),
            models.Index(fields=["contact_is_decision_maker"], name="leads_lead_contact_dm_idx"),
            models.Index(fields=["email_is_generic", "phone_is_shared"], name="leads_lead_email_ph_idx"),
        ]

    def __str__(self) -> str:
        return self.display_name or str(self.pk)
