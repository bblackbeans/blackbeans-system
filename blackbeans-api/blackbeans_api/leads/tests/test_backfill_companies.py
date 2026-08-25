from __future__ import annotations

import pytest

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.models import LeadImport
from blackbeans_api.leads.services import backfill_lead_companies
from blackbeans_api.leads.services import ensure_orphan_leads_have_companies


@pytest.mark.django_db
def test_backfill_links_orphan_leads_to_companies():
    batch = LeadImport.objects.create(
        origem="Campanha 2020-Kelly",
        freshness=LeadImport.Freshness.ANTIGO,
        filename="kelly.csv",
        column_keys=["nome da empresa", "cnpj"],
        row_count=2,
    )
    Lead.objects.create(
        import_batch=batch,
        payload={"nome da empresa": "Construtora Alfa", "cnpj": "12.345.678/0001-90"},
        display_name="Construtora Alfa",
    )
    Lead.objects.create(
        import_batch=batch,
        payload={"nome da empresa": "Construtora Alfa", "cnpj": "12.345.678/0001-90"},
        display_name="Outro contato Alfa",
    )

    assert LeadCompany.objects.count() == 0
    result = backfill_lead_companies(only_missing=True, batch_size=1)
    assert result["processed"] == 2
    assert Lead.objects.filter(company__isnull=True).count() == 0
    assert LeadCompany.objects.count() == 1
    company = LeadCompany.objects.get()
    assert company.contacts_count == 2
    assert "kelly" in company.origem.lower() or company.origem == "Campanha 2020-Kelly"


@pytest.mark.django_db
def test_ensure_is_noop_when_all_leads_have_company():
    company = LeadCompany.objects.create(
        name="Ja vinculada",
        name_normalized="ja vinculada",
        origem="manual",
    )
    Lead.objects.create(
        company=company,
        payload={"nome": "Ja vinculada"},
        display_name="Ja vinculada",
    )
    assert ensure_orphan_leads_have_companies() is None
    assert LeadCompany.objects.count() == 1
