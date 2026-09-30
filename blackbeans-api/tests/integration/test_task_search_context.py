from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Workspace
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def celint_board(admin_client):
    workspace = Workspace.objects.create(name="Operacao")
    client = Client.objects.create(name="CELINT")
    portfolio = Portfolio.objects.create(workspace=workspace, name="Projeto Celint")
    project = Project.objects.create(
        portfolio=portfolio,
        client=client,
        name="Diagnóstico Digital",
        status=Project.Status.ACTIVE,
    )
    board = Board.objects.create(project=project, name="Backlog")
    group = BoardGroup.objects.create(board=board, name="A fazer", position=1, wip_limit=10)
    return {"workspace": workspace, "client": client, "project": project, "board": board, "group": group}


def test_project_search_ignores_accents_and_matches_portfolio(admin_client, celint_board):
    found = admin_client.get("/api/v1/projects", {"search": "celint"})
    assert found.status_code == status.HTTP_200_OK
    names = [row["name"] for row in found.data["data"]["projects"]]
    assert "Diagnóstico Digital" in names
    row = next(item for item in found.data["data"]["projects"] if item["id"] == str(celint_board["project"].pk))
    assert row["portfolio_name"] == "Projeto Celint"
    assert row["workspace_name"] == "Operacao"
    assert row["client_name"] == "CELINT"

    by_project = admin_client.get("/api/v1/projects", {"search": "diagnostico"})
    assert any(item["name"] == "Diagnóstico Digital" for item in by_project.data["data"]["projects"])


def test_workspace_includes_client_and_project_count(admin_client, celint_board):
    response = admin_client.get("/api/v1/workspaces")
    assert response.status_code == status.HTTP_200_OK
    row = next(item for item in response.data["data"]["workspaces"] if item["id"] == str(celint_board["workspace"].pk))
    assert row["projects_count"] == 1
    assert row["client_name"] is None


def test_task_names_search_overdue_and_pagination(admin_client, celint_board):
    group = celint_board["group"]
    yesterday = timezone.now() - timedelta(days=2)
    created = admin_client.post(
        "/api/v1/tasks",
        {
            "group_id": str(group.pk),
            "title": "Analise dos canais",
            "description": "Mapa do diagnostico",
            "status": "todo",
            "end_date": yesterday.isoformat(),
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    task = created.data["data"]["task"]
    assert task["project_name"] == "Diagnóstico Digital"
    assert task["client_name"] == "CELINT"
    assert task["portfolio_name"] == "Projeto Celint"
    assert task["workspace_name"] == "Operacao"
    assert task["group_name"] == "Backlog"
    assert task["parent_id"] is None
    assert task["status_label"]

    by_client = admin_client.get("/api/v1/tasks", {"search": "celint"})
    assert by_client.status_code == status.HTTP_200_OK
    assert any(row["id"] == task["id"] for row in by_client.data["data"]["tasks"])

    by_description = admin_client.get("/api/v1/tasks", {"search": "diagnostico"})
    assert any(row["id"] == task["id"] for row in by_description.data["data"]["tasks"])

    overdue = admin_client.get("/api/v1/tasks", {"overdue": "true", "project_id": str(celint_board["project"].pk)})
    assert [row["id"] for row in overdue.data["data"]["tasks"]] == [task["id"]]

    for index in range(2):
        extra = admin_client.post(
            "/api/v1/tasks",
            {"group_id": str(group.pk), "title": f"Extra {index}", "status": "todo"},
            format="json",
        )
        assert extra.status_code == status.HTTP_201_CREATED

    page = admin_client.get("/api/v1/tasks", {"project_id": str(celint_board["project"].pk), "limit": 1})
    assert page.status_code == status.HTTP_200_OK
    assert page.data["meta"]["total"] == 3
    assert len(page.data["data"]["tasks"]) == 1
    assert page.data["meta"]["next_cursor"]

    boards = admin_client.get("/api/v1/boards", {"search": "celint"})
    assert boards.status_code == status.HTTP_200_OK
    matched = next(row for row in boards.data["data"]["boards"] if row["id"] == str(celint_board["board"].pk))
    assert matched["project_name"] == "Diagnóstico Digital"
    assert matched["client_name"] == "CELINT"
    assert matched["task_counts"].get("todo") == 3
