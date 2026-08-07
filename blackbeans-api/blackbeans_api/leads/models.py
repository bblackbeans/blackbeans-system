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


class Lead(models.Model):
    class ContactStatus(models.TextChoices):
        NAO_CONTATADO = "nao_contatado", _("Nao contatado")
        EM_CONTATO = "em_contato", _("Em contato")
        CONTATADO = "contatado", _("Contatado")
        SEM_INTERESSE = "sem_interesse", _("Sem interesse")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_batch = models.ForeignKey(
        LeadImport,
        on_delete=CASCADE,
        related_name="leads",
    )
    payload = JSONField(default=dict, blank=True)
    display_name = models.CharField(max_length=512, blank=True, default="", db_index=True)
    search_text = models.TextField(blank=True, default="")
    contact_status = models.CharField(
        max_length=32,
        choices=ContactStatus.choices,
        default=ContactStatus.NAO_CONTATADO,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Lead")
        verbose_name_plural = _("Leads")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["contact_status"]),
            models.Index(fields=["display_name"]),
            models.Index(fields=["import_batch", "contact_status"]),
        ]

    def __str__(self) -> str:
        return self.display_name or str(self.pk)
