from __future__ import annotations

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.users.models import UserApiToken
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_user():
    return UserFactory.create(
        password=STRONG_PASSWORD,
        name="Admin PAT",
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )


@pytest.fixture
def collaborator():
    return UserFactory.create(
        password=STRONG_PASSWORD,
        name="Colab PAT",
        is_staff=False,
        is_superuser=False,
        is_active=True,
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


def test_create_list_revoke_api_token(admin_client, admin_user):
    created = admin_client.post(
        "/api/v1/me/api-tokens",
        {"name": "Cursor MCP", "expires_in_days": 30},
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    payload = created.data["data"]["token"]
    raw = payload["token"]
    assert raw.startswith("bb_pat_")
    token_id = payload["id"]

    listed = admin_client.get("/api/v1/me/api-tokens")
    assert listed.status_code == status.HTTP_200_OK
    assert any(row["id"] == token_id for row in listed.data["data"]["tokens"])
    assert all("token" not in row for row in listed.data["data"]["tokens"])

    anon = APIClient()
    me = anon.get("/api/v1/me", HTTP_AUTHORIZATION=f"Bearer {raw}")
    assert me.status_code == status.HTTP_200_OK
    assert me.data["data"]["user"]["username"] == admin_user.username

    revoked = admin_client.delete(f"/api/v1/me/api-tokens/{token_id}")
    assert revoked.status_code == status.HTTP_200_OK
    assert UserApiToken.objects.get(pk=token_id).revoked_at is not None

    denied = anon.get("/api/v1/me", HTTP_AUTHORIZATION=f"Bearer {raw}")
    assert denied.status_code == status.HTTP_401_UNAUTHORIZED


def test_collaborator_cannot_request_sprints_write_scope(collaborator):
    client = APIClient()
    client.force_authenticate(user=collaborator)
    response = client.post(
        "/api/v1/me/api-tokens",
        {"name": "Bad", "scopes": ["tasks:read", "sprints:write"]},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_pat_scope_blocks_task_write(admin_client, admin_user):
    created = admin_client.post(
        "/api/v1/me/api-tokens",
        {"name": "Read only", "scopes": ["tasks:read", "sprints:read"]},
        format="json",
    )
    raw = created.data["data"]["token"]["token"]
    client = APIClient()
    response = client.post(
        "/api/v1/tasks",
        {"title": "X", "group_id": "00000000-0000-0000-0000-000000000001"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
