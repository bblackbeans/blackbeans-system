import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import CASCADE
from django.db.models import BooleanField
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import EmailField
from django.db.models import ForeignKey
from django.db.models import JSONField
from django.db.models import Q
from django.db.models import UniqueConstraint
from django.db.models import UUIDField
from django.urls import reverse
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """
    Default custom user model for blackbeans-system.
    If adding fields that need to be filled at user signup,
    check forms.SignupForm and forms.SocialSignupForms accordingly.
    """

    # First and last name do not cover name patterns around the globe
    name = CharField(_("Name of User"), blank=True, max_length=255)
    totp_enabled = BooleanField(default=False)
    totp_secret = CharField(max_length=128, blank=True, default="")
    totp_pending_secret = CharField(max_length=128, blank=True, default="")
    totp_recovery_codes = JSONField(default=list, blank=True)
    first_name = None  # type: ignore[assignment]
    last_name = None  # type: ignore[assignment]

    def get_absolute_url(self) -> str:
        """Get URL for user's detail view.

        Returns:
            str: URL for user detail.

        """
        return reverse("users:detail", kwargs={"username": self.username})


class Department(models.Model):
    """Departamento organizacional; workspace opcional pode ser adicionado em story futura."""

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = CharField(_("Name"), max_length=255)
    code = CharField(_("Code"), max_length=64, blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Department")
        verbose_name_plural = _("Departments")

    def __str__(self) -> str:
        return self.name


class Collaborator(models.Model):
    """Identidade operacional; story 1.5 adiciona dados profissionais e departamento."""

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_name = CharField(_("Display name"), max_length=255)
    job_title = CharField(_("Job title"), max_length=255, blank=True, default="")
    professional_email = EmailField(_("Professional email"), blank=True, default="")
    phone = CharField(_("Phone"), max_length=64, blank=True, default="")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Collaborator")
        verbose_name_plural = _("Collaborators")

    def __str__(self) -> str:
        return self.display_name


class CollaboratorDepartmentLink(models.Model):
    """No maximo um vinculo ativo por colaborador com departamento."""

    collaborator = ForeignKey(
        Collaborator,
        on_delete=CASCADE,
        related_name="department_links",
    )
    department = ForeignKey(
        Department,
        on_delete=CASCADE,
        related_name="collaborator_links",
    )
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Collaborator department link")
        verbose_name_plural = _("Collaborator department links")
        constraints = [
            UniqueConstraint(
                fields=["collaborator"],
                condition=Q(is_active=True),
                name="uniq_active_collaborator_department_link",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.collaborator_id} -> {self.department_id}"


class UserCollaboratorLink(models.Model):
    """Vinculo ativo/inativo entre usuario Django e colaborador (1:1 ativo por lado)."""

    user = ForeignKey(User, on_delete=CASCADE, related_name="collaborator_links")
    collaborator = ForeignKey(
        Collaborator,
        on_delete=CASCADE,
        related_name="user_links",
    )
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("User collaborator link")
        verbose_name_plural = _("User collaborator links")
        constraints = [
            UniqueConstraint(
                fields=["user"],
                condition=Q(is_active=True),
                name="uniq_active_user_collaborator_link",
            ),
            UniqueConstraint(
                fields=["collaborator"],
                condition=Q(is_active=True),
                name="uniq_active_collaborator_user_link",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} -> {self.collaborator_id}"
