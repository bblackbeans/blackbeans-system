from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from blackbeans_api.users.models import UserAdminAreaAccess
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


def _collab_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_me_admin_area_access_staff_returns_all(admin_client):
    client, _admin = admin_client
    response = client.get("/api/v1/me/admin-area-access")
    assert response.status_code == 200
    assert response.data["data"]["all"] is True
    assert response.data["data"]["area_keys"] == []


def test_me_admin_area_access_collaborator_with_leads():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=user, area_key="leads")
    client = _collab_client(user)
    response = client.get("/api/v1/me/admin-area-access")
    assert response.status_code == 200
    assert response.data["data"]["all"] is False
    assert response.data["data"]["area_keys"] == ["leads"]


def test_put_admin_area_access_replace_all(admin_client):
    client, _admin = admin_client
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    first = client.put(
        f"/api/v1/users/{target.pk}/admin-area-access",
        {"area_keys": ["leads", "clients"]},
        format="json",
    )
    assert first.status_code == 200
    assert set(first.data["data"]["area_keys"]) == {"leads", "clients"}

    second = client.put(
        f"/api/v1/users/{target.pk}/admin-area-access",
        {"area_keys": ["leads"]},
        format="json",
    )
    assert second.status_code == 200
    assert second.data["data"]["area_keys"] == ["leads"]
    assert list(
        UserAdminAreaAccess.objects.filter(user=target).values_list("area_key", flat=True),
    ) == ["leads"]


def test_put_admin_area_access_rejects_invalid_key(admin_client):
    client, _admin = admin_client
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    response = client.put(
        f"/api/v1/users/{target.pk}/admin-area-access",
        {"area_keys": ["leads", "task-intake"]},
        format="json",
    )
    assert response.status_code == 400


def test_put_admin_area_access_forbidden_for_staff_target(admin_client):
    client, _admin = admin_client
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True)
    response = client.put(
        f"/api/v1/users/{target.pk}/admin-area-access",
        {"area_keys": ["leads"]},
        format="json",
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "admin_area_access_forbidden"


def test_promote_to_staff_clears_admin_area_grants(admin_client):
    client, _admin = admin_client
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=target, area_key="leads")
    response = client.patch(
        f"/api/v1/users/{target.pk}",
        {"is_staff": True},
        format="json",
    )
    assert response.status_code == 200
    assert UserAdminAreaAccess.objects.filter(user=target).count() == 0


def test_leads_api_forbidden_without_grant():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    client = _collab_client(user)
    response = client.get("/api/v1/leads?page=1&page_size=10")
    assert response.status_code == 403


def test_leads_api_allowed_with_grant():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=user, area_key="leads")
    client = _collab_client(user)
    response = client.get("/api/v1/leads?page=1&page_size=10")
    assert response.status_code == 200


def test_stats_hours_dashboard_allowed_with_stats_grant():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=user, area_key="stats")
    client = _collab_client(user)
    response = client.get("/api/v1/admin/hours-dashboard")
    assert response.status_code == 200


def test_collaborator_with_users_grant_cannot_promote_to_staff(admin_client):
    _admin_client, _admin = admin_client
    actor = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=actor, area_key="users")
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    client = _collab_client(actor)
    response = client.patch(
        f"/api/v1/users/{target.pk}",
        {"is_staff": True},
        format="json",
    )
    assert response.status_code == 403
    target.refresh_from_db()
    assert target.is_staff is False


def test_collaborator_cannot_put_admin_area_access():
    actor = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserAdminAreaAccess.objects.create(user=actor, area_key="users")
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    client = _collab_client(actor)
    response = client.put(
        f"/api/v1/users/{target.pk}/admin-area-access",
        {"area_keys": ["leads"]},
        format="json",
    )
    assert response.status_code == 403
