from __future__ import annotations

import uuid

from django.contrib.auth.hashers import check_password
from django.contrib.auth.hashers import make_password
from django.db import models
from django.db.models import BooleanField
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import Index
from django.db.models import TextField
from django.db.models import UUIDField
from django.utils.translation import gettext_lazy as _


class Client(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", _("Active")
        INACTIVE = "inactive", _("Inactive")

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = CharField(max_length=255)
    cnpj = CharField(max_length=18, unique=True, null=True, blank=True)
    contact_name = CharField(max_length=255, blank=True, default="")
    financial_emails = TextField(blank=True, default="")
    status = CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    description = TextField(blank=True, default="")
    portal_username = CharField(max_length=150, unique=True, null=True, blank=True)
    portal_password_hash = CharField(max_length=128, blank=True, default="")
    portal_enabled = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Client")
        verbose_name_plural = _("Clients")
        indexes = [
            Index(fields=["status"]),
            Index(fields=["name"]),
            Index(fields=["cnpj"]),
        ]

    def __str__(self) -> str:
        return self.name

    def set_portal_password(self, raw_password: str) -> None:
        self.portal_password_hash = make_password(raw_password)

    def check_portal_password(self, raw_password: str) -> bool:
        if not self.portal_password_hash:
            return False
        return check_password(raw_password, self.portal_password_hash)
