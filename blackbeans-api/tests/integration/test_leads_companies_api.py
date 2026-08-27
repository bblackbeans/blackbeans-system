from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    password = STRONG_PASSWORD
    admin = UserFactory.create(password=password, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client, admin


def test_list_companies_does_not_backfill_orphans(admin_client):
    client, _admin = admin_client
    Lead.objects.create(display_name="Orfao", payload={"nome": "Orfao"})

    with patch("blackbeans_api.leads.services.backfill_lead_companies") as backfill:
        response = client.get("/api/v1/leads/companies?page=1&page_size=20")

    assert response.status_code == 200
    backfill.assert_not_called()
    assert Lead.objects.filter(company__isnull=True).count() == 1
    assert LeadCompany.objects.count() == 0


def test_list_companies_omits_contacts_by_default(admin_client):
    client, _admin = admin_client
    company = LeadCompany.objects.create(
        name="Construtora Alfa",
        name_normalized="construtora alfa",
        origem="scraper",
        completeness_score=80,
        contacts_count=1,
    )
    Lead.objects.create(
        company=company,
        display_name="Maria Souza",
        email="maria.souza@alfa.com.br",
        payload={"nome": "Maria Souza", "extra": "x" * 5000},
    )

    response = client.get("/api/v1/leads/companies?page=1&page_size=20&ordering=-completeness_score")
    assert response.status_code == 200
    rows = response.data["data"]["companies"]
    assert len(rows) == 1
    assert rows[0]["name"] == "Construtora Alfa"
    assert "contacts" not in rows[0]
    assert rows[0]["rd_status"] == "not_sent"


def test_company_detail_returns_contacts_without_payload(admin_client):
    client, _admin = admin_client
    company = LeadCompany.objects.create(
        name="Construtora Beta",
        name_normalized="construtora beta",
        origem="scraper",
        completeness_score=70,
        contacts_count=1,
    )
    Lead.objects.create(
        company=company,
        display_name="Joao Silva",
        email="joao.silva@beta.com.br",
        payload={"nome": "Joao Silva"},
    )

    response = client.get(f"/api/v1/leads/companies/{company.pk}")
    assert response.status_code == 200
    row = response.data["data"]["company"]
    assert row["name"] == "Construtora Beta"
    assert len(row["contacts"]) == 1
    assert row["contacts"][0]["display_name"] == "Joao Silva"
    assert "payload" not in row["contacts"][0]

