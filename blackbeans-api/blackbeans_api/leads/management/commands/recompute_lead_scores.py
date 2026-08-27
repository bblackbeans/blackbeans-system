from __future__ import annotations

from django.core.management.base import BaseCommand

from blackbeans_api.leads.services import recompute_all_lead_scores


class Command(BaseCommand):
    help = (
        "Recalcula o score de prospecção (qualidade do contato, duplicatas e decisor)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Tamanho do bulk_update (default: 500).",
        )

    def handle(self, *args, **options):
        batch_size = max(1, int(options["batch_size"]))
        self.stdout.write("Recalculando scores de leads...")
        result = recompute_all_lead_scores(batch_size=batch_size)
        self.stdout.write(
            self.style.SUCCESS(
                f"Concluido: {result['leads']} contato(s), "
                f"{result['companies']} empresa(s).",
            ),
        )
