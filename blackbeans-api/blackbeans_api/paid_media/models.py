import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _


class PaidMediaConnection(models.Model):
    class Provider(models.TextChoices):
        META = "meta", _("Meta")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "governance.Workspace",
        on_delete=models.PROTECT,
        related_name="paid_media_connections",
    )
    provider = models.CharField(
        max_length=16,
        choices=Provider.choices,
        default=Provider.META,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Paid media connection")
        verbose_name_plural = _("Paid media connections")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "provider"],
                name="paid_media_connection_workspace_provider_uniq",
            ),
            models.CheckConstraint(
                condition=models.Q(provider="meta"),
                name="paid_media_connection_provider_meta",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.workspace} - {self.provider}"


class MetaAdAccountLinkQuerySet(models.QuerySet):
    def eligible_for(self, workspace):
        return self.filter(
            workspace=workspace,
            is_active=True,
            connection__is_active=True,
        )


class MetaAdAccountLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "governance.Workspace",
        on_delete=models.PROTECT,
        related_name="meta_ad_account_links",
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="meta_ad_account_links",
    )
    connection = models.ForeignKey(
        PaidMediaConnection,
        on_delete=models.PROTECT,
        related_name="account_links",
    )
    external_account_id = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = MetaAdAccountLinkQuerySet.as_manager()

    class Meta:
        verbose_name = _("Meta ad account link")
        verbose_name_plural = _("Meta ad account links")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "external_account_id"],
                name="paid_media_link_workspace_external_id_uniq",
            ),
        ]

    def __str__(self) -> str:
        return self.display_name or self.external_account_id

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.external_account_id = self.external_account_id.strip()
        errors = {}
        if not self.external_account_id:
            errors["external_account_id"] = _("External account ID cannot be blank.")
        if self.workspace_id and self.connection_id:
            if self.connection.workspace_id != self.workspace_id:
                errors["connection"] = _(
                    "The connection must belong to the link workspace.",
                )
        if self.workspace_id and self.client_id:
            if self.workspace.client_id != self.client_id:
                errors["client"] = _(
                    "The client must be associated with the link workspace.",
                )
        if errors:
            raise ValidationError(errors)
