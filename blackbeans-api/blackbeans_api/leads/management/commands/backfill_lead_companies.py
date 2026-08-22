from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.services import build_search_text
from blackbeans_api.leads.services import get_or_create_company_for_payload
from blackbeans_api.leads.services import recompute_company_quality


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

        queryset = Lead.objects.select_related("import_batch", "company").order_by("created_at")
        if only_missing:
            queryset = queryset.filter(company__isnull=True)

        total = queryset.count()
        self.stdout.write(f"Processando {total} lead(s)...")

        processed = 0
        company_cache: dict = {}
        touched: dict[str, LeadCompany] = {}

        offset = 0
        while True:
            batch = list(queryset[offset : offset + batch_size])
            if not batch:
                break
            with transaction.atomic():
                for lead in batch:
                    column_keys = list((lead.import_batch.column_keys if lead.import_batch else None) or [])
                    if not column_keys:
                        column_keys = list((lead.payload or {}).keys())
                    origem = ""
                    freshness = "novo"
                    if lead.import_batch:
                        origem = lead.import_batch.origem
                        freshness = lead.import_batch.freshness
                    company, enriched = get_or_create_company_for_payload(
                        payload=dict(lead.payload or {}),
                        column_keys=column_keys,
                        origem=origem,
                        freshness=freshness,
                        cache=company_cache,
                    )
                    lead.company = company
                    lead.display_name = enriched["display_name"] or lead.display_name
                    lead.email = enriched["email"]
                    lead.phone = enriched["phone"]
                    lead.cnpj = enriched["cnpj"]
                    lead.has_cnpj = enriched["has_cnpj"]
                    lead.has_phone = enriched["has_phone"]
                    lead.has_email = enriched["has_email"]
                    lead.completeness_score = enriched["completeness_score"]
                    lead.search_text = build_search_text(
                        payload=dict(lead.payload or {}),
                        origem=origem,
                        display_name=lead.display_name,
                    )
                    lead.save(
                        update_fields=[
                            "company",
                            "display_name",
                            "email",
                            "phone",
                            "cnpj",
                            "has_cnpj",
                            "has_phone",
                            "has_email",
                            "completeness_score",
                            "search_text",
                            "updated_at",
                        ],
                    )
                    touched[str(company.pk)] = company
                    processed += 1
            offset += batch_size
            self.stdout.write(f"  {processed}/{total}")

        self.stdout.write(f"Recalculando qualidade de {len(touched)} empresa(s)...")
        for company in touched.values():
            recompute_company_quality(company)

        # Empresas sem contatos — zera contagem/score agregado
        orphan_companies = LeadCompany.objects.annotate(n=Count("contacts")).filter(n=0)
        orphan_count = orphan_companies.count()
        for company in orphan_companies.iterator():
            recompute_company_quality(company)

        self.stdout.write(
            self.style.SUCCESS(
                f"Concluido: {processed} lead(s), {len(touched)} empresa(s) tocadas"
                + (f", {orphan_count} sem contatos." if orphan_count else "."),
            ),
        )
