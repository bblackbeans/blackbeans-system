from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from blackbeans_api.clients.tests.factories import ClientFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


def test_service_catalog_crud(admin_client):
    create = admin_client.post(
        "/api/v1/services",
        {"name": "Servico QA", "description": "Teste", "is_active": True, "display_order": 999},
        format="json",
    )
    assert create.status_code == 201
    service_id = create.data["data"]["service"]["id"]

    listing = admin_client.get("/api/v1/services")
    assert listing.status_code == 200
    assert any(item["id"] == service_id for item in listing.data["data"]["services"])

    patch = admin_client.patch(f"/api/v1/services/{service_id}", {"is_active": False}, format="json")
    assert patch.status_code == 200
    assert patch.data["data"]["service"]["is_active"] is False

    delete = admin_client.delete(f"/api/v1/services/{service_id}")
    assert delete.status_code == 200
    assert delete.data["data"]["deleted"] is True


def test_contract_confirm_creates_workspace_and_projects(admin_client):
    client = ClientFactory.create(
        name="Cliente Contrato",
        cnpj="54321678000195",
        contact_name="Contato",
        financial_emails="fin@cliente.local",
    )
    service_resp = admin_client.post(
        "/api/v1/services",
        {"name": "Social Media QA", "description": "Teste", "is_active": True, "display_order": 50},
        format="json",
    )
    assert service_resp.status_code == 201
    service_id = service_resp.data["data"]["service"]["id"]

    contract_resp = admin_client.post(
        "/api/v1/contracts",
        {
            "client": str(client.pk),
            "emits_invoice": True,
            "has_iss_retention": True,
            "has_inss_retention": False,
            "payment_method": "pix",
            "status": "submitted",
            "service_lines": [
                {
                    "service": service_id,
                    "service_type": "recurring",
                    "recurrence": "monthly",
                    "amount": "1800.00",
                    "starts_on": "2026-06-01",
                    "ends_on": "2026-12-01",
                    "notes": "Plano mensal",
                },
            ],
        },
        format="json",
    )
    assert contract_resp.status_code == 201
    contract_id = contract_resp.data["data"]["contract"]["id"]

    confirm = admin_client.post(f"/api/v1/contracts/{contract_id}/confirm", {}, format="json")
    assert confirm.status_code == 200
    assert confirm.data["data"]["contract"]["status"] == "active"
    assert confirm.data["data"]["workspace_id"]
    assert len(confirm.data["data"]["projects_created"]) == 1

    cancel = admin_client.post(f"/api/v1/contracts/{contract_id}/cancel", {}, format="json")
    assert cancel.status_code == 200
    assert cancel.data["data"]["contract"]["status"] == "cancelled"

    reactivate = admin_client.post(f"/api/v1/contracts/{contract_id}/reactivate", {}, format="json")
    assert reactivate.status_code == 200
    assert reactivate.data["data"]["contract"]["status"] == "active"


def test_contract_reactivate_submitted_after_cancel(admin_client):
    client = ClientFactory.create(
        name="Cliente Reativar",
        cnpj="11222333000181",
        contact_name="Contato",
        financial_emails="fin@reativar.local",
    )
    service_resp = admin_client.post(
        "/api/v1/services",
        {"name": "Servico Reativar", "description": "Teste", "is_active": True, "display_order": 51},
        format="json",
    )
    assert service_resp.status_code == 201
    service_id = service_resp.data["data"]["service"]["id"]

    contract_resp = admin_client.post(
        "/api/v1/contracts",
        {
            "client": str(client.pk),
            "payment_method": "boleto",
            "status": "submitted",
            "service_lines": [
                {"service": service_id, "service_type": "one_off", "amount": "500.00"},
            ],
        },
        format="json",
    )
    assert contract_resp.status_code == 201
    contract_id = contract_resp.data["data"]["contract"]["id"]

    cancel = admin_client.post(f"/api/v1/contracts/{contract_id}/cancel", {}, format="json")
    assert cancel.status_code == 200

    reactivate = admin_client.post(f"/api/v1/contracts/{contract_id}/reactivate", {}, format="json")
    assert reactivate.status_code == 200
    assert reactivate.data["data"]["contract"]["status"] == "submitted"

