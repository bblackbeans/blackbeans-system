import uuid

from django.db import models
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
    status = CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    description = TextField(blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Client")
        verbose_name_plural = _("Clients")
        indexes = [
            Index(fields=["status"]),
            Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return self.name
