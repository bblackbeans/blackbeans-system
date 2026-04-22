from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from blackbeans_api.users.models import CollaboratorDepartmentLink
from blackbeans_api.users.models import UserCollaboratorLink
from blackbeans_api.users.tests.factories import CollaboratorFactory
from blackbeans_api.users.tests.factories import DepartmentFactory
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


def test_post_collaborator_201(admin_client):
    client, _admin = admin_client
    response = client.post(
        "/api/v1/collaborators",
        {
            "display_name": "Maria Silva",
            "job_title": "Designer",
            "professional_email": "maria@example.com",
            "phone": "+5511999990000",
        },
        format="json",
    )
    assert response.status_code == 201
    c = response.data["data"]["collaborator"]
    assert c["display_name"] == "Maria Silva"
    assert c["job_title"] == "Designer"
    assert c["professional_email"] == "maria@example.com"
    assert c["phone"] == "+5511999990000"
    assert c["department"] is None
    assert "id" in c


def test_patch_collaborator_200_and_404(admin_client):
    client, _admin = admin_client
    collab = CollaboratorFactory.create(display_name="Antigo")
    response = client.patch(
        f"/api/v1/collaborators/{collab.pk}",
        {"job_title": "Senior", "display_name": "Novo Nome"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["data"]["collaborator"]["job_title"] == "Senior"
    assert response.data["data"]["collaborator"]["display_name"] == "Novo Nome"

    missing = client.patch(
        f"/api/v1/collaborators/{uuid.uuid4()}",
        {"job_title": "X"},
        format="json",
    )
    assert missing.status_code == 404
    assert missing.data["error"]["code"] == "collaborator_not_found"


def test_department_link_create_substitution_and_idempotent(admin_client):
    client, _admin = admin_client
    collab = CollaboratorFactory.create()
    d1 = DepartmentFactory.create()
    d2 = DepartmentFactory.create()

    r1 = client.post(
        f"/api/v1/collaborators/{collab.pk}/department-links",
        {"department_id": str(d1.pk)},
        format="json",
    )
    assert r1.status_code == 201
    assert r1.data["data"]["department_id"] == str(d1.pk)
    assert CollaboratorDepartmentLink.objects.filter(collaborator=collab, is_active=True).count() == 1

    r2 = client.post(
        f"/api/v1/collaborators/{collab.pk}/department-links",
        {"department_id": str(d2.pk)},
        format="json",
    )
    assert r2.status_code == 201
    assert r2.data["data"]["department_id"] == str(d2.pk)
    active = CollaboratorDepartmentLink.objects.filter(collaborator=collab, is_active=True)
    assert active.count() == 1
    assert str(active.get().department_id) == str(d2.pk)

    r3 = client.post(
        f"/api/v1/collaborators/{collab.pk}/department-links",
        {"department_id": str(d2.pk)},
        format="json",
    )
    assert r3.status_code == 200
    assert CollaboratorDepartmentLink.objects.filter(collaborator=collab, is_active=True).count() == 1


def test_department_link_department_not_found(admin_client):
    client, _admin = admin_client
    collab = CollaboratorFactory.create()
    response = client.post(
        f"/api/v1/collaborators/{collab.pk}/department-links",
        {"department_id": str(uuid.uuid4())},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "department_not_found"


def test_department_link_collaborator_not_found(admin_client):
    client, _admin = admin_client
    dept = DepartmentFactory.create()
    response = client.post(
        f"/api/v1/collaborators/{uuid.uuid4()}/department-links",
        {"department_id": str(dept.pk)},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "collaborator_not_found"


def test_me_collaborator_profile_linked_and_missing():
    collab = CollaboratorFactory.create(display_name="Perfil", job_title="Dev")
    dept = DepartmentFactory.create(name="Eng")
    CollaboratorDepartmentLink.objects.create(
        collaborator=collab,
        department=dept,
        is_active=True,
    )
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    UserCollaboratorLink.objects.create(user=user, collaborator=collab, is_active=True)

    token = str(RefreshToken.for_user(user).access_token)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/api/v1/me/collaborator-profile")
    assert response.status_code == 200
    profile = response.data["data"]["profile"]
    assert profile["display_name"] == "Perfil"
    assert profile["job_title"] == "Dev"
    assert profile["department"]["name"] == "Eng"

    lone = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    lone_client = APIClient()
    lone_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(lone).access_token}",
    )
    empty = lone_client.get("/api/v1/me/collaborator-profile")
    assert empty.status_code == 404
    assert empty.data["error"]["code"] == "collaborator_profile_not_found"


def test_non_staff_cannot_mutate_collaborators():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    assert client.post(
        "/api/v1/collaborators",
        {"display_name": "X"},
        format="json",
    ).status_code == 403
