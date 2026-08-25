from __future__ import annotations

from django.core.management.base import BaseCommand

from blackbeans_api.leads.services import backfill_lead_companies


class Command(BaseCommand):
    help = "Associa leads existentes a LeadCompany e recalcula flags/score de qualidade."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Quantidade de leads processados por lote (default: 200).",
        )
        parser.add_argument(
            "--only-missing",
            action="store_true",
            help="Processa apenas leads sem company.",
        )

    def handle(self, *args, **options):
        batch_size = max(1, int(options["batch_size"]))
        only_missing = bool(options["only_missing"])
        self.stdout.write("Processando leads...")
        result = backfill_lead_companies(only_missing=only_missing, batch_size=batch_size)
        self.stdout.write(
            self.style.SUCCESS(
                f"Concluido: {result['processed']} lead(s), {result['companies']} empresa(s) tocadas"
                + (f", {result['orphans']} sem contatos." if result["orphans"] else "."),
            ),
        )
