from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from blackbeans_api.users.tests.factories import CollaboratorFactory
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


def test_create_user_returns_201(admin_client):
    client, _admin = admin_client
    response = client.post(
        "/api/v1/users",
        {
            "username": "novo_usuario_api",
            "email": "novo_usuario_api@example.com",
            "password": STRONG_PASSWORD,
            "name": "Novo Usuario",
            "is_staff": False,
        },
        format="json",
    )
    assert response.status_code == 201
    assert "data" in response.data
    assert response.data["data"]["user"]["username"] == "novo_usuario_api"
    assert response.data["data"]["user"]["is_active"] is True
    assert "password" not in response.data["data"]["user"]


def test_patch_user_returns_200(admin_client):
    client, _admin = admin_client
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    response = client.patch(
        f"/api/v1/users/{target.pk}",
        {"name": "Nome Novo", "email": "renomeado@example.com"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["data"]["user"]["name"] == "Nome Novo"
    assert response.data["data"]["user"]["email"] == "renomeado@example.com"


def test_deactivated_user_cannot_start_admin_login(admin_client):
    client, admin = admin_client
    password = STRONG_PASSWORD
    target = UserFactory.create(password=password, is_staff=True, is_active=True)
    deactivate = client.patch(
        f"/api/v1/users/{target.pk}",
        {"is_active": False},
        format="json",
    )
    assert deactivate.status_code == 200

    anon = APIClient()
    login = anon.post(
        "/api/v1/auth/tokens",
        {"username": target.username, "password": password},
        format="json",
    )
    assert login.status_code == 401
    assert login.data["error"]["code"] == "invalid_credentials"


def test_collaborator_link_create_and_delete(admin_client):
    client, admin = admin_client
    collab = CollaboratorFactory.create()
    other = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True)

    create_link = client.post(
        f"/api/v1/users/{other.pk}/collaborator-links",
        {"collaborator_id": str(collab.pk)},
        format="json",
    )
    assert create_link.status_code == 201
    assert create_link.data["data"]["is_active"] is True

    dup = client.post(
        f"/api/v1/users/{admin.pk}/collaborator-links",
        {"collaborator_id": str(collab.pk)},
        format="json",
    )
    assert dup.status_code == 409
    assert dup.data["error"]["code"] == "link_conflict"

    delete = client.delete(f"/api/v1/users/{other.pk}/collaborator-links/{collab.pk}")
    assert delete.status_code == 200
    assert delete.data["data"]["is_active"] is False


def test_user_cannot_have_two_active_links(admin_client):
    client, _admin = admin_client
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True)
    c1 = CollaboratorFactory.create()
    c2 = CollaboratorFactory.create()
    assert (
        client.post(
            f"/api/v1/users/{user.pk}/collaborator-links",
            {"collaborator_id": str(c1.pk)},
            format="json",
        ).status_code
        == 201
    )
    second = client.post(
        f"/api/v1/users/{user.pk}/collaborator-links",
        {"collaborator_id": str(c2.pk)},
        format="json",
    )
    assert second.status_code == 409
    assert second.data["error"]["code"] == "link_conflict"


def test_unauthenticated_post_users_returns_envelope():
    client = APIClient()
    response = client.post(
        "/api/v1/users",
        {
            "username": "x",
            "email": "x@example.com",
            "password": STRONG_PASSWORD,
        },
        format="json",
    )
    assert response.status_code == 401
    assert response.data["error"]["code"] == "not_authenticated"
    assert "correlation_id" in response.data


def test_non_staff_jwt_returns_403():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    token = str(RefreshToken.for_user(user).access_token)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        "/api/v1/users",
        {
            "username": "blocked",
            "email": "blocked@example.com",
            "password": STRONG_PASSWORD,
        },
        format="json",
    )
    assert response.status_code == 403
    assert response.data["error"]["code"] == "forbidden"


def test_patch_unknown_user_returns_404(admin_client):
    client, _admin = admin_client
    response = client.patch(
        "/api/v1/users/999999",
        {"name": "Nada"},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "user_not_found"


def test_link_unknown_collaborator_returns_validation_error(admin_client):
    client, _admin = admin_client
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True)
    response = client.post(
        f"/api/v1/users/{user.pk}/collaborator-links",
        {"collaborator_id": str(uuid.uuid4())},
        format="json",
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"


def test_delete_unknown_link_returns_404(admin_client):
    client, _admin = admin_client
    response = client.delete(
        f"/api/v1/users/{_admin.pk}/collaborator-links/{uuid.uuid4()}",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "link_not_found"
