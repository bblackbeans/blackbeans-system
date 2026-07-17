from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.agent_service import BLOCKED_STALE_AGENT_SLUG
from blackbeans_api.governance.agent_service import OVERDUE_AGENT_SLUG
from blackbeans_api.governance.agent_service import build_blocked_stale_tasks_report
from blackbeans_api.governance.agent_service import execute_blocked_stale_tasks_agent
from blackbeans_api.governance.agent_service import execute_overdue_tasks_weekly_agent
from blackbeans_api.governance.agent_service import fallback_overdue_briefing
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
def board_context(db, admin_user):
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
    return {
        "board": board,
        "group": group,
        "admin": admin_user,
        "assignee": assignee,
        "project": project,
    }


@pytest.fixture
def overdue_context(board_context):
    task = Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Tarefa atrasada de teste",
        status=Task.Status.TODO,
        assignee=board_context["assignee"],
        end_date=timezone.now() - timedelta(days=3),
    )
    return {**board_context, "task": task}


def _ensure_overdue_agent():
    AgentDefinition.objects.update_or_create(
        slug=OVERDUE_AGENT_SLUG,
        defaults={
            "title": "Tarefas atrasadas (semanal)",
            "description": "test",
            "schedule_hint": "weekly",
            "is_enabled": True,
        },
    )


def _ensure_blocked_agent():
    AgentDefinition.objects.update_or_create(
        slug=BLOCKED_STALE_AGENT_SLUG,
        defaults={
            "title": "Detector de bloqueio (diario)",
            "description": "test",
            "schedule_hint": "daily",
            "is_enabled": True,
        },
    )


@pytest.mark.django_db
def test_fallback_overdue_briefing_mentions_total():
    text = fallback_overdue_briefing(
        {
            "total_overdue": 2,
            "by_project": [{"project_name": "P1", "count": 2}],
            "by_assignee": [{"assignee_name": "A", "count": 2}],
        },
    )
    assert "2 tarefa" in text
    assert "P1" in text


@pytest.mark.django_db
def test_execute_overdue_agent_creates_run_and_notifies_admin(overdue_context, settings):
    settings.OPENAI_API_KEY = ""
    settings.AGENT_LLM_ENABLED = True
    _ensure_overdue_agent()
    run = execute_overdue_tasks_weekly_agent(correlation_id="test-agent")
    assert run.status == AgentRun.Status.SUCCESS
    assert run.report_json.get("total_overdue") >= 1
    assert run.report_json.get("ai_mode") == "fallback"
    assert run.report_json.get("ai_briefing")
    assert Notification.objects.filter(
        type=Notification.Type.AGENT_REPORT,
        user=overdue_context["admin"],
    ).exists()
    note = Notification.objects.filter(
        type=Notification.Type.AGENT_REPORT,
        user=overdue_context["admin"],
    ).latest("created_at")
    assert "Analise:" in note.message


@pytest.mark.django_db
def test_execute_overdue_agent_uses_openai_when_mocked(overdue_context, settings, monkeypatch):
    settings.OPENAI_API_KEY = "sk-test"
    settings.AGENT_LLM_ENABLED = True
    monkeypatch.setattr(
        "blackbeans_api.governance.agent_service.complete_text",
        lambda **kwargs: "Briefing mockado de riscos e plano.",
    )
    _ensure_overdue_agent()
    run = execute_overdue_tasks_weekly_agent(correlation_id="test-openai")
    assert run.status == AgentRun.Status.SUCCESS
    assert run.report_json.get("ai_mode") == "openai"
    assert "Briefing mockado" in run.report_json.get("ai_briefing", "")


@pytest.mark.django_db
def test_agents_api_list_and_run_now(overdue_context, admin_user, settings):
    settings.OPENAI_API_KEY = ""
    _ensure_overdue_agent()
    client = APIClient()
    client.force_authenticate(user=admin_user)

    listed = client.get("/api/v1/agents")
    assert listed.status_code == status.HTTP_200_OK
    agents = listed.data["data"]["agents"]
    assert any(row["slug"] == OVERDUE_AGENT_SLUG for row in agents)

    ran = client.post(f"/api/v1/agents/{OVERDUE_AGENT_SLUG}/run", {}, format="json")
    assert ran.status_code == status.HTTP_201_CREATED
    assert ran.data["data"]["run"]["status"] == "success"
    assert ran.data["data"]["run"]["report"]["total_overdue"] >= 1
    assert ran.data["data"]["run"]["report"]["ai_briefing"]


@pytest.mark.django_db
def test_blocked_stale_report_includes_blocked_and_stale(board_context, settings):
    settings.AGENT_STALE_DAYS = 7
    now = timezone.now()
    blocked = Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Bloqueada recente",
        status=Task.Status.BLOCKED,
        assignee=board_context["assignee"],
    )
    Task.objects.filter(pk=blocked.pk).update(updated_at=now)
    stale = Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Parada antiga",
        status=Task.Status.IN_PROGRESS,
        assignee=board_context["assignee"],
    )
    Task.objects.filter(pk=stale.pk).update(updated_at=now - timedelta(days=10))
    fresh = Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Em dia",
        status=Task.Status.TODO,
        assignee=board_context["assignee"],
    )
    Task.objects.filter(pk=fresh.pk).update(updated_at=now)

    report = build_blocked_stale_tasks_report(now=now)
    titles = {row["title"] for row in report["items"]}
    assert "Bloqueada recente" in titles
    assert "Parada antiga" in titles
    assert "Em dia" not in titles
    assert report["total_flagged"] >= 2
    reasons = {row["title"]: row["reason"] for row in report["items"]}
    assert reasons["Bloqueada recente"] == "blocked"
    assert reasons["Parada antiga"] == "stale"


@pytest.mark.django_db
def test_blocked_agent_api_run_now(board_context, admin_user, settings):
    settings.OPENAI_API_KEY = ""
    settings.AGENT_STALE_DAYS = 7
    now = timezone.now()
    task = Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Travada",
        status=Task.Status.BLOCKED,
        assignee=board_context["assignee"],
    )
    Task.objects.filter(pk=task.pk).update(updated_at=now)
    _ensure_blocked_agent()

    client = APIClient()
    client.force_authenticate(user=admin_user)
    ran = client.post(f"/api/v1/agents/{BLOCKED_STALE_AGENT_SLUG}/run", {}, format="json")
    assert ran.status_code == status.HTTP_201_CREATED
    assert ran.data["data"]["run"]["status"] == "success"
    assert ran.data["data"]["run"]["report"]["total_flagged"] >= 1
    assert ran.data["data"]["run"]["report"]["ai_mode"] == "fallback"
    assert ran.data["data"]["run"]["report"]["ai_briefing"]


@pytest.mark.django_db
def test_execute_blocked_agent_success(board_context, settings):
    settings.OPENAI_API_KEY = ""
    Task.objects.create(
        board=board_context["board"],
        group=board_context["group"],
        title="Blocked exec",
        status=Task.Status.BLOCKED,
        assignee=board_context["assignee"],
    )
    _ensure_blocked_agent()
    run = execute_blocked_stale_tasks_agent(correlation_id="blocked-test")
    assert run.status == AgentRun.Status.SUCCESS
    assert run.report_json.get("total_flagged") >= 1
