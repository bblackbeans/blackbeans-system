"""Cria automacoes de demonstracao no workspace do seed QA. Idempotente pelo prefixo [DEMO]."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.core.management.base import CommandError

from blackbeans_api.automations.catalog import RECIPES
from blackbeans_api.automations.models import Automation
from blackbeans_api.governance.models import Workspace


class Command(BaseCommand):
    help = "Instala as receitas prontas como automacoes [DEMO] em um workspace (rode seed_qa_demo antes)."

    def add_arguments(self, parser):
        parser.add_argument("--workspace", default="Produção")
        parser.add_argument("--owner", default="admin.teste")

    def handle(self, *args, **options):
        ws = Workspace.objects.filter(name=options["workspace"]).first()
        if ws is None:
            raise CommandError(f"Workspace '{options['workspace']}' nao encontrado. Rode seed_qa_demo.")
        owner = get_user_model().objects.filter(username=options["owner"]).first()
        created = 0
        for recipe in RECIPES:
            _, was_created = Automation.objects.get_or_create(
                workspace=ws,
                name=f"[DEMO] {recipe['name']}",
                defaults={
                    "description": recipe["description"],
                    "trigger_type": recipe["trigger_type"],
                    "trigger_config": recipe["trigger_config"],
                    "conditions": recipe["conditions"],
                    "actions": recipe["actions"],
                    "created_by": owner,
                    "is_enabled": True,
                },
            )
            created += int(was_created)
        # Demos valem para todos os quadros da area de trabalho (board vazio).
        Automation.objects.filter(workspace=ws, name__startswith="[DEMO] ").update(board=None)
        self.stdout.write(self.style.SUCCESS(f"{created} automacao(oes) [DEMO] criadas em '{ws.name}'."))
