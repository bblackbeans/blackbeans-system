from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import CASCADE
from django.db.models import SET_NULL
from django.utils.translation import gettext_lazy as _


class ProblemReport(models.Model):
    class Status(models.TextChoices):
        NOVO = "novo", _("Novo")
        EM_ANALISE = "em_analise", _("Em analise")
        RESOLVIDO = "resolvido", _("Resolvido")
        DESCARTADO = "descartado", _("Descartado")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="problem_reports",
    )
    workspace = models.ForeignKey(
        "governance.Workspace",
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="problem_reports",
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    steps = models.TextField(blank=True, default="")
    source = models.CharField(max_length=32, default="feedback")
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.NOVO,
    )
    url = models.CharField(max_length=2048, blank=True, default="")
    correlation_id = models.CharField(max_length=36, db_index=True)
    context_json = models.JSONField(default=dict, blank=True)
    internal_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Problem report")
        verbose_name_plural = _("Problem reports")
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["user"]),
            models.Index(fields=["workspace"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"
