from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from blackbeans_api.clients.models import Client
from blackbeans_api.clients.tests.factories import ClientFactory
from blackbeans_api.users.tests.factories import UserFactory
from tests.integration.auth_helpers import obtain_admin_access_token

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    password = STRONG_PASSWORD
    admin = UserFactory.create(password=password, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    token = obtain_admin_access_token(client, username=admin.username, password=password)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, admin


def test_create_client_returns_201(admin_client):
    client, _admin = admin_client
    response = client.post(
        "/api/v1/clients",
        {
            "name": "Acme Corp",
            "description": "Cliente enterprise",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["client"]["name"] == "Acme Corp"
    assert response.data["data"]["client"]["status"] == Client.Status.ACTIVE


def test_create_client_invalid_payload_returns_400(admin_client):
    client, _admin = admin_client
    response = client.post(
        "/api/v1/clients",
        {"description": "Sem nome"},
        format="json",
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"


def test_list_clients_filters_and_paginates(admin_client):
    client, _admin = admin_client
    ClientFactory.create(name="Alpha One", status=Client.Status.ACTIVE)
    ClientFactory.create(name="Alpha Two", status=Client.Status.INACTIVE)
    ClientFactory.create(name="Beta Active", status=Client.Status.ACTIVE)

    response = client.get(
        "/api/v1/clients",
        {"status": "active", "search": "Alpha", "page": 1, "page_size": 1},
    )
    assert response.status_code == 200
    assert response.data["meta"]["total"] == 1
    assert response.data["meta"]["page"] == 1
    assert response.data["meta"]["page_size"] == 1
    assert response.data["meta"]["pages"] == 1
    assert response.data["meta"]["has_next"] is False
    assert response.data["meta"]["has_prev"] is False
    assert len(response.data["data"]["clients"]) == 1
    assert response.data["data"]["clients"][0]["name"] == "Alpha One"


def test_patch_client_returns_200(admin_client):
    client, _admin = admin_client
    target = ClientFactory.create(name="Cliente Antigo", status=Client.Status.ACTIVE)
    response = client.patch(
        f"/api/v1/clients/{target.pk}",
        {"name": "Cliente Atualizado", "status": "inactive"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["data"]["client"]["name"] == "Cliente Atualizado"
    assert response.data["data"]["client"]["status"] == Client.Status.INACTIVE


def test_patch_unknown_client_returns_404(admin_client):
    client, _admin = admin_client
    response = client.patch(
        "/api/v1/clients/00000000-0000-0000-0000-000000000000",
        {"name": "Nao existe"},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "client_not_found"
