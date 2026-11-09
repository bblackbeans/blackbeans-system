from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import CASCADE
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import ForeignKey
from django.db.models import JSONField
from django.db.models import TextField
from django.db.models import UUIDField

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import Workspace


class Automation(models.Model):
    """Receita "quando <gatilho>, se <condicoes>, entao <acoes>" (estilo Monday)."""

    class Importance(models.TextChoices):
        CRITICAL = "critical", "Critica"
        HIGH = "high", "Alta"
        NORMAL = "normal", "Normal"
        LOW = "low", "Pequena"

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = ForeignKey(Workspace, on_delete=CASCADE, related_name="automations")
    # Vazio = vale para todos os quadros da area de trabalho.
    board = ForeignKey(Board, on_delete=CASCADE, null=True, blank=True, related_name="automations")
    name = CharField(max_length=255)
    description = TextField(blank=True, default="")
    is_enabled = models.BooleanField(default=True)
    # Apenas etiqueta de organizacao (como no Monday): nao altera a ordem de execucao.
    importance = CharField(max_length=16, choices=Importance.choices, default=Importance.NORMAL)
    trigger_type = CharField(max_length=48)
    trigger_config = JSONField(default=dict, blank=True)
    conditions = JSONField(default=list, blank=True)
    actions = JSONField(default=list, blank=True)
    created_by = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="automations_created",
    )
    run_count = models.PositiveIntegerField(default=0)
    last_run_at = DateTimeField(null=True, blank=True)
    # Marco da ultima janela processada dos gatilhos de agenda (schedule.recurring).
    last_scheduled_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Automation"
        verbose_name_plural = "Automations"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["workspace", "is_enabled", "trigger_type"]),
        ]

    def __str__(self) -> str:
        return self.name


class AutomationRun(models.Model):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    automation = ForeignKey(Automation, on_delete=CASCADE, related_name="runs")
    task = ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name="automation_runs")
    status = CharField(max_length=16, choices=Status.choices)
    trigger_type = CharField(max_length=48)
    event = JSONField(default=dict, blank=True)
    actions_log = JSONField(default=list, blank=True)
    error_message = TextField(blank=True, default="")
    depth = models.PositiveSmallIntegerField(default=0)
    is_dry_run = models.BooleanField(default=False)
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Automation run"
        verbose_name_plural = "Automation runs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["automation", "-created_at"]),
            models.Index(fields=["automation", "task", "trigger_type"]),
        ]
