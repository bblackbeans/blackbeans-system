from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from blackbeans_api.users.models import Collaborator
from blackbeans_api.users.models import UserCollaboratorLink

User = get_user_model()


class Command(BaseCommand):
    help = "Cria usuario colaborador de demonstracao com vinculo ativo."

    def handle(self, *args, **options):
        username = "colaborador_demo"
        email = "colaborador.demo@blackbeans.local"
        password = "Colab!Demo2025#"
        display_name = "Colaborador Demo"

        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "name": display_name,
                "is_active": True,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        if user_created:
            user.set_password(password)
            user.save(update_fields=["password"])
        else:
            updates: list[str] = []
            if not user.email:
                user.email = email
                updates.append("email")
            if not user.name:
                user.name = display_name
                updates.append("name")
            if user.is_staff:
                user.is_staff = False
                updates.append("is_staff")
            if not user.is_active:
                user.is_active = True
                updates.append("is_active")
            if updates:
                user.save(update_fields=updates)

        collaborator, collab_created = Collaborator.objects.get_or_create(
            professional_email=email,
            defaults={
                "display_name": display_name,
                "job_title": "Colaborador",
                "phone": "",
            },
        )
        if not collaborator.display_name:
            collaborator.display_name = display_name
            collaborator.save(update_fields=["display_name", "updated_at"])

        UserCollaboratorLink.objects.filter(user=user, is_active=True).exclude(collaborator=collaborator).update(
            is_active=False,
        )
        UserCollaboratorLink.objects.filter(collaborator=collaborator, is_active=True).exclude(user=user).update(
            is_active=False,
        )
        link, link_created = UserCollaboratorLink.objects.get_or_create(
            user=user,
            collaborator=collaborator,
            defaults={"is_active": True},
        )
        if not link.is_active:
            link.is_active = True
            link.save(update_fields=["is_active", "updated_at"])

        self.stdout.write(self.style.SUCCESS("Usuario colaborador pronto."))
        self.stdout.write(f"- username: {username}")
        self.stdout.write(f"- senha: {password}")
        self.stdout.write(f"- email: {user.email or email}")
        self.stdout.write(f"- user_id: {user.pk}")
        self.stdout.write(f"- collaborator_id: {collaborator.pk}")
        self.stdout.write(
            f"- status: user_created={user_created} collaborator_created={collab_created} link_created={link_created}",
        )
