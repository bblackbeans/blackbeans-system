from __future__ import annotations

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from blackbeans_api.feedback.models import ProblemReport
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client, admin


@pytest.fixture
def collaborator_client():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True, is_superuser=False)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture(autouse=True)
def clear_rate_limit_cache():
    cache.clear()
    yield
    cache.clear()


def _valid_payload(**overrides):
    payload = {
        "titulo": "Botao salvar nao responde",
        "descricao": "Ao clicar em Salvar nada acontece.",
        "passos": "1) Login\n2) Clicar Salvar",
        "contexto": {
            "url": "http://localhost:13000/#my-work",
            "user_agent": "pytest",
            "viewport": {"width": 1280, "height": 800},
        },
    }
    payload.update(overrides)
    return payload


def test_create_feedback_returns_201(collaborator_client):
    client, user = collaborator_client
    response = client.post("/api/v1/problem-reports/feedback", _valid_payload(), format="json")

    assert response.status_code == 201
    assert "id" in response.data["data"]
    assert "correlation_id" in response.data["data"]
    report = ProblemReport.objects.get(pk=response.data["data"]["id"])
    assert report.user_id == user.pk
    assert report.title == "Botao salvar nao responde"


def test_create_feedback_invalid_screenshot_returns_400(collaborator_client):
    client, _user = collaborator_client
    payload = _valid_payload(
        contexto={
            "url": "http://localhost:13000",
            "screenshot": {"mime": "image/png", "data": "not-a-data-url"},
        },
    )
    response = client.post("/api/v1/problem-reports/feedback", payload, format="json")
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"


def test_create_feedback_oversized_screenshot_returns_400(collaborator_client):
    client, _user = collaborator_client
    payload = _valid_payload(
        contexto={
            "url": "http://localhost:13000",
            "screenshot": {"mime": "image/jpeg", "data": "data:image/jpeg;base64," + ("A" * 130_000)},
        },
    )
    response = client.post("/api/v1/problem-reports/feedback", payload, format="json")
    assert response.status_code == 400


@override_settings(PROBLEM_REPORTS_RATE_LIMIT_PER_HOUR=2)
def test_create_feedback_rate_limit_returns_429(collaborator_client):
    client, _user = collaborator_client
    for _ in range(2):
        response = client.post("/api/v1/problem-reports/feedback", _valid_payload(), format="json")
        assert response.status_code == 201

    response = client.post("/api/v1/problem-reports/feedback", _valid_payload(), format="json")
    assert response.status_code == 429
    assert response.data["error"]["code"] == "rate_limit_exceeded"


@override_settings(PROBLEM_REPORTS_FEEDBACK_ENABLED=False)
def test_create_feedback_disabled_returns_503(collaborator_client):
    client, _user = collaborator_client
    response = client.post("/api/v1/problem-reports/feedback", _valid_payload(), format="json")
    assert response.status_code == 503
    assert response.data["error"]["code"] == "feedback_disabled"


def test_collaborator_cannot_list_reports(collaborator_client):
    client, _user = collaborator_client
    response = client.get("/api/v1/problem-reports")
    assert response.status_code == 403


def test_admin_list_excludes_media_data(admin_client, collaborator_client):
    collab_api, collab_user = collaborator_client
    create_resp = collab_api.post(
        "/api/v1/problem-reports/feedback",
        _valid_payload(
            contexto={
                "url": "http://localhost:13000",
                "screenshot": {"mime": "image/jpeg", "data": "data:image/jpeg;base64,abc"},
                "screen_recording": {
                    "mime": "video/webm",
                    "data": "data:video/webm;base64,xyz",
                    "duration_ms": 5000,
                },
            },
        ),
        format="json",
    )
    assert create_resp.status_code == 201
    report_id = create_resp.data["data"]["id"]

    admin_api, _admin = admin_client
    list_resp = admin_api.get("/api/v1/problem-reports")
    assert list_resp.status_code == 200
    row = next(item for item in list_resp.data["data"]["problem_reports"] if item["id"] == report_id)
    assert row["has_screenshot"] is True
    assert row["has_recording"] is True
    screenshot = row["contexto_json"].get("screenshot", {})
    assert screenshot.get("has_data") is True
    assert "abc" not in str(row["contexto_json"])

    detail_resp = admin_api.get(f"/api/v1/problem-reports/{report_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.data["data"]["problem_report"]
    assert detail["contexto_json"]["screenshot"]["data"] == "data:image/jpeg;base64,abc"


def test_admin_patch_and_delete_report(admin_client, collaborator_client):
    collab_api, _collab_user = collaborator_client
    create_resp = collab_api.post("/api/v1/problem-reports/feedback", _valid_payload(), format="json")
    report_id = create_resp.data["data"]["id"]

    admin_api, _admin = admin_client
    patch_resp = admin_api.patch(
        f"/api/v1/problem-reports/{report_id}",
        {"status": "em_analise", "notas_internas": "Investigando"},
        format="json",
    )
    assert patch_resp.status_code == 200
    assert patch_resp.data["data"]["problem_report"]["status"] == "em_analise"
    assert patch_resp.data["data"]["problem_report"]["notas_internas"] == "Investigando"

    delete_resp = admin_api.delete(f"/api/v1/problem-reports/{report_id}")
    assert delete_resp.status_code == 200
    assert not ProblemReport.objects.filter(pk=report_id).exists()
