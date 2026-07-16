from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.agent_service import execute_overdue_tasks_weekly_agent
from blackbeans_api.governance.models import AgentDefinition
from blackbeans_api.governance.models import AgentRun
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import Workspace

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="agent_admin",
        email="agent_admin@example.com",
        password="Str0ng!PassWord#1",
        is_staff=True,
        is_superuser=True,
        name="Agent Admin",
    )


@pytest.fixture
def overdue_context(db, admin_user):
    workspace = Workspace.objects.create(name="WS Agents")
    portfolio = Portfolio.objects.create(workspace=workspace, name="PF")
    project = Project.objects.create(portfolio=portfolio, name="Proj Atrasos")
    board = Board.objects.create(project=project, name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=10)
    assignee = User.objects.create_user(
        username="agent_collab",
        email="collab@example.com",
        password="Str0ng!PassWord#1",
        name="Collab",
    )
    task = Task.objects.create(
        board=board,
        group=group,
        title="Tarefa atrasada de teste",
        status=Task.Status.TODO,
        assignee=assignee,
        end_date=timezone.now() - timedelta(days=3),
    )
    return {"task": task, "admin": admin_user, "assignee": assignee}


@pytest.mark.django_db
def test_execute_overdue_agent_creates_run_and_notifies_admin(overdue_context):
    AgentDefinition.objects.update_or_create(
        slug="overdue_tasks_weekly",
        defaults={
            "title": "Tarefas atrasadas (semanal)",
            "description": "test",
            "schedule_hint": "weekly",
            "is_enabled": True,
        },
    )
    run = execute_overdue_tasks_weekly_agent(correlation_id="test-agent")
    assert run.status == AgentRun.Status.SUCCESS
    assert run.report_json.get("total_overdue") >= 1
    assert Notification.objects.filter(
        type=Notification.Type.AGENT_REPORT,
        user=overdue_context["admin"],
    ).exists()


@pytest.mark.django_db
def test_agents_api_list_and_run_now(overdue_context, admin_user):
    AgentDefinition.objects.update_or_create(
        slug="overdue_tasks_weekly",
        defaults={
            "title": "Tarefas atrasadas (semanal)",
            "description": "test",
            "schedule_hint": "weekly",
            "is_enabled": True,
        },
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)

    listed = client.get("/api/v1/agents")
    assert listed.status_code == status.HTTP_200_OK
    agents = listed.data["data"]["agents"]
    assert any(row["slug"] == "overdue_tasks_weekly" for row in agents)

    ran = client.post("/api/v1/agents/overdue_tasks_weekly/run", {}, format="json")
    assert ran.status_code == status.HTTP_201_CREATED
    assert ran.data["data"]["run"]["status"] == "success"
    assert ran.data["data"]["run"]["report"]["total_overdue"] >= 1
