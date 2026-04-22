from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.clients.models import Client
from blackbeans_api.clients.tests.factories import ClientFactory
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import AuditLog
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskDependency
from blackbeans_api.governance.models import TimeLog
from blackbeans_api.governance.tasks import dispatch_deadline_notifications
from blackbeans_api.governance.tests.factories import PortfolioFactory
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.governance.tests.factories import WorkspaceFactory
from blackbeans_api.users.tests.factories import UserFactory
from tests.integration.auth_helpers import obtain_admin_access_token

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(
        password=STRONG_PASSWORD,
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )
    client = APIClient()
    token = obtain_admin_access_token(client, username=admin.username, password=STRONG_PASSWORD)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def test_story_2_2_client_detail_with_stats(admin_client):
    c = ClientFactory.create()
    ws = WorkspaceFactory.create(client=c)
    portfolio = PortfolioFactory.create(workspace=ws)
    ProjectFactory.create(portfolio=portfolio, client=c, status=Project.Status.COMPLETED)
    ProjectFactory.create(portfolio=portfolio, client=c, status=Project.Status.AT_RISK)

    response = admin_client.get(f"/api/v1/clients/{c.pk}")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["data"]["stats"]["workspaces_count"] == 1
    assert response.data["data"]["stats"]["portfolio_count"] == 1
    assert response.data["data"]["stats"]["project_count"] == 2
    assert response.data["data"]["stats"]["completed_projects_count"] == 1
    assert response.data["data"]["stats"]["at_risk_projects_count"] == 1


def test_story_2_3_workspace_crud_with_optional_client(admin_client):
    c = ClientFactory.create()
    created = admin_client.post("/api/v1/workspaces", {"name": "WS sem cliente"}, format="json")
    assert created.status_code == status.HTTP_201_CREATED
    assert created.data["data"]["workspace"]["client_id"] is None

    linked = admin_client.patch(
        f"/api/v1/workspaces/{created.data['data']['workspace']['id']}",
        {"client_id": str(c.pk)},
        format="json",
    )
    assert linked.status_code == status.HTTP_200_OK
    assert linked.data["data"]["workspace"]["client_id"] == str(c.pk)

    ws_with_dep = WorkspaceFactory.create()
    PortfolioFactory.create(workspace=ws_with_dep)
    blocked = admin_client.delete(f"/api/v1/workspaces/{ws_with_dep.pk}")
    assert blocked.status_code == status.HTTP_409_CONFLICT
    assert blocked.data["error"]["code"] == "workspace_has_dependencies"


def test_story_2_4_portfolio_crud(admin_client):
    ws = WorkspaceFactory.create()
    created = admin_client.post(
        "/api/v1/portfolios",
        {"workspace_id": str(ws.pk), "name": "Port 1"},
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    portfolio_id = created.data["data"]["portfolio"]["id"]

    updated = admin_client.patch(
        f"/api/v1/portfolios/{portfolio_id}",
        {"name": "Port Atualizado"},
        format="json",
    )
    assert updated.status_code == status.HTTP_200_OK
    assert updated.data["data"]["portfolio"]["name"] == "Port Atualizado"


def test_story_2_5_project_crud_with_client_and_portfolio(admin_client):
    client = ClientFactory.create(status=Client.Status.ACTIVE)
    portfolio = PortfolioFactory.create(workspace=WorkspaceFactory.create(client=client))
    created = admin_client.post(
        "/api/v1/projects",
        {
            "portfolio_id": str(portfolio.pk),
            "client_id": str(client.pk),
            "name": "Projeto X",
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    project_id = created.data["data"]["project"]["id"]

    updated = admin_client.patch(
        f"/api/v1/projects/{project_id}",
        {"name": "Projeto Y"},
        format="json",
    )
    assert updated.status_code == status.HTTP_200_OK
    assert updated.data["data"]["project"]["name"] == "Projeto Y"


def test_story_2_x_list_workspaces_portfolios_and_projects(admin_client):
    workspace = WorkspaceFactory.create(name="WS Lista")
    portfolio = PortfolioFactory.create(workspace=workspace, name="Port Lista")
    ProjectFactory.create(portfolio=portfolio, name="Projeto Lista")

    workspaces_response = admin_client.get("/api/v1/workspaces")
    assert workspaces_response.status_code == status.HTTP_200_OK
    assert len(workspaces_response.data["data"]["workspaces"]) >= 1

    portfolios_response = admin_client.get("/api/v1/portfolios")
    assert portfolios_response.status_code == status.HTTP_200_OK
    assert len(portfolios_response.data["data"]["portfolios"]) >= 1

    projects_response = admin_client.get("/api/v1/projects")
    assert projects_response.status_code == status.HTTP_200_OK
    assert len(projects_response.data["data"]["projects"]) >= 1


def test_story_2_6_project_status_and_schedule(admin_client):
    project = ProjectFactory.create()
    status_resp = admin_client.patch(
        f"/api/v1/projects/{project.pk}/status",
        {"status": Project.Status.ACTIVE},
        format="json",
    )
    assert status_resp.status_code == status.HTTP_200_OK
    assert status_resp.data["data"]["project"]["status"] == Project.Status.ACTIVE

    now = timezone.now()
    schedule_resp = admin_client.patch(
        f"/api/v1/projects/{project.pk}/schedule",
        {"start_date": now.isoformat(), "end_date": (now + timedelta(days=7)).isoformat()},
        format="json",
    )
    assert schedule_resp.status_code == status.HTTP_200_OK


def test_story_2_7_project_metrics(admin_client):
    project = ProjectFactory.create(
        status=Project.Status.ACTIVE,
        end_date=timezone.now() - timedelta(days=1),
    )
    response = admin_client.get(f"/api/v1/projects/{project.pk}/metrics")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["data"]["risk_level"] == "high"
    assert response.data["data"]["progress_percent"] == 0


def test_story_2_8_client_status_toggle(admin_client):
    client = ClientFactory.create(status=Client.Status.ACTIVE)
    response = admin_client.post(f"/api/v1/clients/{client.pk}/status-toggle", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["data"]["status"] == Client.Status.INACTIVE


def test_story_3_1_create_board_linked_to_project(admin_client):
    project = ProjectFactory.create()
    response = admin_client.post(
        "/api/v1/boards",
        {"project_id": str(project.pk), "name": "Board Principal"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    board_id = response.data["data"]["board"]["id"]
    created = Board.objects.get(pk=board_id)
    assert created.project_id == project.pk


def test_story_3_x_list_boards_groups_and_tasks(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board API")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=5)
    Task.objects.create(board=board, group=group, title="Task API")

    boards_response = admin_client.get("/api/v1/boards")
    assert boards_response.status_code == status.HTTP_200_OK
    assert len(boards_response.data["data"]["boards"]) >= 1

    groups_response = admin_client.get(f"/api/v1/boards/{board.pk}/groups")
    assert groups_response.status_code == status.HTTP_200_OK
    assert len(groups_response.data["data"]["groups"]) >= 1

    tasks_response = admin_client.get(f"/api/v1/tasks?board_id={board.pk}")
    assert tasks_response.status_code == status.HTTP_200_OK
    assert len(tasks_response.data["data"]["tasks"]) >= 1


def test_story_3_1_create_board_invalid_project_returns_400(admin_client):
    response = admin_client.post(
        "/api/v1/boards",
        {"project_id": "00000000-0000-0000-0000-000000000000", "name": "Board"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "validation_error"


def test_story_3_2_create_group_and_default_position(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    response = admin_client.post(
        f"/api/v1/boards/{board.pk}/groups",
        {"name": "Backlog", "wip_limit": 3},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["data"]["group"]["position"] == 1


def test_story_3_2_update_group_wip_and_position(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    g1 = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    g2 = BoardGroup.objects.create(board=board, name="Doing", position=2, wip_limit=2)

    response = admin_client.patch(
        f"/api/v1/groups/{g2.pk}",
        {"position": 1, "wip_limit": 5},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    g1.refresh_from_db()
    g2.refresh_from_db()
    assert g2.position == 1
    assert g1.position == 2
    assert g2.wip_limit == 5


def test_story_3_2_invalid_wip_returns_400(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=1)
    response = admin_client.patch(
        f"/api/v1/groups/{group.pk}",
        {"wip_limit": 0},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "validation_error"


def test_story_3_3_board_views_list_and_kanban(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    admin_client.post(
        "/api/v1/tasks",
        {
            "group_id": str(group.pk),
            "title": "Tarefa 1",
            "status": "todo",
        },
        format="json",
    )
    list_resp = admin_client.get(f"/api/v1/boards/{board.pk}", {"view": "list"})
    assert list_resp.status_code == status.HTTP_200_OK
    assert list_resp.data["data"]["view"] == "list"
    kanban_resp = admin_client.get(f"/api/v1/boards/{board.pk}", {"view": "kanban"})
    assert kanban_resp.status_code == status.HTTP_200_OK
    assert kanban_resp.data["data"]["view"] == "kanban"


def test_story_3_3_timeline_forbidden_for_non_superuser():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    client = APIClient()
    token = obtain_admin_access_token(client, username=user.username, password=STRONG_PASSWORD)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    resp = client.get(f"/api/v1/boards/{board.pk}", {"view": "timeline"})
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_story_3_4_task_create_and_edit(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    created = admin_client.post(
        "/api/v1/tasks",
        {
            "group_id": str(group.pk),
            "title": "Task X",
            "priority": "high",
            "effort_points": 5,
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    task_id = created.data["data"]["task"]["id"]
    patched = admin_client.patch(
        f"/api/v1/tasks/{task_id}",
        {"title": "Task Y", "status": "in_progress"},
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["data"]["task"]["title"] == "Task Y"


def test_story_3_5_assign_and_my_tasks_filter(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Task A", status="todo")
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    assign = admin_client.patch(
        f"/api/v1/tasks/{task.pk}/assignee",
        {"assignee_id": target.pk},
        format="json",
    )
    assert assign.status_code == status.HTTP_200_OK

    target_client = APIClient()
    token = obtain_admin_access_token(target_client, username=target.username, password=STRONG_PASSWORD)
    target_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    mine = target_client.get("/api/v1/my-tasks", {"status": "todo"})
    assert mine.status_code == status.HTTP_200_OK
    assert mine.data["meta"]["total"] >= 1


def test_story_3_6_dependencies_and_recalc_dates(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    predecessor = Task.objects.create(
        board=board,
        group=group,
        title="Pred",
        status="todo",
        start_date=timezone.now(),
        end_date=timezone.now() + timedelta(days=2),
    )
    dependent = Task.objects.create(
        board=board,
        group=group,
        title="Dep",
        status="todo",
    )
    dep_resp = admin_client.post(
        f"/api/v1/tasks/{dependent.pk}/dependencies",
        {"depends_on_task_id": str(predecessor.pk)},
        format="json",
    )
    assert dep_resp.status_code == status.HTTP_201_CREATED
    dependent.refresh_from_db()
    assert dependent.start_date is not None


def test_story_3_7_task_status_blocked_rule(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    blocked = Task.objects.create(board=board, group=group, title="Blocked", status="blocked")
    target = Task.objects.create(board=board, group=group, title="Target", status="in_progress")
    TaskDependency.objects.create(task=target, depends_on=blocked)
    resp = admin_client.patch(
        f"/api/v1/tasks/{target.pk}/status",
        {"status": "done"},
        format="json",
    )
    assert resp.status_code == status.HTTP_409_CONFLICT
    assert resp.data["error"]["code"] == "task_blocked"


def test_story_3_8_comments_and_attachments(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Task")
    comment = admin_client.post(
        f"/api/v1/tasks/{task.pk}/comments",
        {"content": "Contexto da tarefa"},
        format="json",
    )
    assert comment.status_code == status.HTTP_201_CREATED
    attachment = admin_client.post(
        f"/api/v1/tasks/{task.pk}/attachments",
        {"filename": "doc.txt", "content_type": "text/plain", "size_bytes": 10},
        format="json",
    )
    assert attachment.status_code == status.HTTP_201_CREATED


def test_story_3_9_task_activity_and_board_progress(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    t1 = Task.objects.create(board=board, group=group, title="A", status="done")
    Task.objects.create(board=board, group=group, title="B", status="todo")
    activity = admin_client.get(f"/api/v1/tasks/{t1.pk}/activity")
    assert activity.status_code == status.HTTP_200_OK
    progress = admin_client.get(f"/api/v1/boards/{board.pk}/progress")
    assert progress.status_code == status.HTTP_200_OK
    assert progress.data["data"]["counts"]["done"] == 1


def test_story_4_1_start_pause_resume_time_log(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=3)
    task = Task.objects.create(board=board, group=group, title="Cronometrada", status="in_progress")

    started = admin_client.post(f"/api/v1/tasks/{task.pk}/time/start", {}, format="json")
    assert started.status_code == status.HTTP_200_OK
    duplicate = admin_client.post(f"/api/v1/tasks/{task.pk}/time/start", {}, format="json")
    assert duplicate.status_code == status.HTTP_409_CONFLICT
    paused = admin_client.post(f"/api/v1/tasks/{task.pk}/time/pause", {}, format="json")
    assert paused.status_code == status.HTTP_200_OK
    resumed = admin_client.post(f"/api/v1/tasks/{task.pk}/time/resume", {}, format="json")
    assert resumed.status_code == status.HTTP_200_OK
    assert resumed.data["data"]["time_log"]["status"] == TimeLog.Status.ACTIVE


def test_story_4_2_complete_task_closes_active_time_log(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=3)
    task = Task.objects.create(board=board, group=group, title="Finalizar", status="in_progress")
    admin_client.post(f"/api/v1/tasks/{task.pk}/time/start", {}, format="json")

    response = admin_client.post(f"/api/v1/tasks/{task.pk}/complete", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    task.refresh_from_db()
    assert task.status == Task.Status.DONE
    assert response.data["data"]["time_log"]["status"] == TimeLog.Status.COMPLETED


def test_story_4_3_edit_and_delete_time_log(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=3)
    task = Task.objects.create(board=board, group=group, title="Ajuste apontamento", status="in_progress")
    owner = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    now = timezone.now()
    log = TimeLog.objects.create(
        task=task,
        user=owner,
        status=TimeLog.Status.COMPLETED,
        started_at=now - timedelta(hours=2),
        ended_at=now - timedelta(hours=1),
        accumulated_seconds=3600,
    )

    patched = admin_client.patch(
        f"/api/v1/time-logs/{log.pk}",
        {
            "started_at": (now - timedelta(hours=3)).isoformat(),
            "ended_at": (now - timedelta(hours=1)).isoformat(),
        },
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["data"]["time_log"]["total_seconds"] == 7200

    deleted = admin_client.delete(f"/api/v1/time-logs/{log.pk}")
    assert deleted.status_code == status.HTTP_200_OK
    log.refresh_from_db()
    assert log.status == TimeLog.Status.DELETED


def test_story_4_4_time_summary_and_filtered_list(admin_client):
    workspace = WorkspaceFactory.create()
    portfolio = PortfolioFactory.create(workspace=workspace)
    project = ProjectFactory.create(portfolio=portfolio)
    board = Board.objects.create(project=project, name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=3)
    task = Task.objects.create(board=board, group=group, title="Consolidar", status="in_progress")
    owner = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    now = timezone.now()
    TimeLog.objects.create(
        task=task,
        user=owner,
        status=TimeLog.Status.COMPLETED,
        started_at=now - timedelta(hours=4),
        ended_at=now - timedelta(hours=3),
        accumulated_seconds=3600,
    )
    TimeLog.objects.create(
        task=task,
        user=owner,
        status=TimeLog.Status.COMPLETED,
        started_at=now - timedelta(hours=2),
        ended_at=now - timedelta(hours=1),
        accumulated_seconds=3600,
    )

    summary = admin_client.get(f"/api/v1/tasks/{task.pk}/time-summary")
    assert summary.status_code == status.HTTP_200_OK
    assert summary.data["data"]["total_seconds"] == 7200

    listing = admin_client.get(
        "/api/v1/time-logs",
        {"workspace_id": str(workspace.pk), "from": now.date().isoformat(), "to": now.date().isoformat()},
    )
    assert listing.status_code == status.HTTP_200_OK
    assert listing.data["meta"]["total"] >= 2


def test_story_5_1_assignment_creates_async_notification(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Nova", status="todo")
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    response = admin_client.patch(
        f"/api/v1/tasks/{task.pk}/assignee",
        {"assignee_id": target.pk},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert Notification.objects.filter(user=target, task=task, type=Notification.Type.ASSIGNED).exists()


def test_story_5_2_complete_creates_notifications_for_relevant_users(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=2)
    assignee = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    task = Task.objects.create(board=board, group=group, title="Concluir", status="in_progress", assignee=assignee)
    admin_client.post(f"/api/v1/tasks/{task.pk}/time/start", {}, format="json")

    response = admin_client.post(f"/api/v1/tasks/{task.pk}/complete", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert Notification.objects.filter(user=assignee, task=task, type=Notification.Type.COMPLETED).exists()


def test_story_5_3_deadline_notifications_no_short_window_duplicates(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    assignee = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    now = timezone.now()
    overdue = Task.objects.create(
        board=board,
        group=group,
        title="Atrasada",
        status="in_progress",
        assignee=assignee,
        end_date=now - timedelta(hours=3),
    )
    due_soon = Task.objects.create(
        board=board,
        group=group,
        title="Vence ja",
        status="todo",
        assignee=assignee,
        end_date=now + timedelta(hours=12),
    )
    dispatch_deadline_notifications(correlation_id="test")
    dispatch_deadline_notifications(correlation_id="test")

    assert Notification.objects.filter(user=assignee, task=overdue, type=Notification.Type.OVERDUE).count() == 1
    assert Notification.objects.filter(user=assignee, task=due_soon, type=Notification.Type.DUE_SOON).count() == 1


def test_story_5_4_notifications_center_and_mark_as_read(admin_client):
    owner = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Notificada", status="todo")
    notif = Notification.objects.create(
        user=owner,
        task=task,
        type=Notification.Type.ASSIGNED,
        title="Nova tarefa",
        message="Voce recebeu uma tarefa",
    )

    user_client = APIClient()
    token = obtain_admin_access_token(user_client, username=owner.username, password=STRONG_PASSWORD)
    user_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    listing = user_client.get("/api/v1/notifications")
    assert listing.status_code == status.HTTP_200_OK
    assert listing.data["meta"]["total"] >= 1

    mark_read = user_client.post(f"/api/v1/notifications/{notif.pk}/read", {}, format="json")
    assert mark_read.status_code == status.HTTP_200_OK
    assert mark_read.data["data"]["notification"]["is_read"] is True


def test_story_5_5_unread_count_consistent_with_mark_as_read(admin_client):
    owner = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Contador", status="todo")
    notif = Notification.objects.create(
        user=owner,
        task=task,
        type=Notification.Type.ASSIGNED,
        title="Nova tarefa",
        message="Voce recebeu uma tarefa",
    )

    user_client = APIClient()
    token = obtain_admin_access_token(user_client, username=owner.username, password=STRONG_PASSWORD)
    user_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    count_before = user_client.get("/api/v1/notifications/unread-count")
    assert count_before.status_code == status.HTTP_200_OK
    assert count_before.data["data"]["unread_count"] >= 1

    user_client.post(f"/api/v1/notifications/{notif.pk}/read", {}, format="json")
    count_after = user_client.get("/api/v1/notifications/unread-count")
    assert count_after.status_code == status.HTTP_200_OK
    assert count_after.data["data"]["unread_count"] == count_before.data["data"]["unread_count"] - 1


def test_story_6_1_workspace_crud_generates_audit_logs(admin_client):
    created = admin_client.post("/api/v1/workspaces", {"name": "Audit WS"}, format="json")
    assert created.status_code == status.HTTP_201_CREATED
    workspace_id = created.data["data"]["workspace"]["id"]
    patched = admin_client.patch(f"/api/v1/workspaces/{workspace_id}", {"name": "Audit WS v2"}, format="json")
    assert patched.status_code == status.HTTP_200_OK
    deleted = admin_client.delete(f"/api/v1/workspaces/{workspace_id}")
    assert deleted.status_code == status.HTTP_200_OK
    assert AuditLog.objects.filter(event_type="workspace.created", entity_id=workspace_id).exists()
    assert AuditLog.objects.filter(event_type="workspace.updated", entity_id=workspace_id).exists()
    assert AuditLog.objects.filter(event_type="workspace.deleted", entity_id=workspace_id).exists()


def test_story_6_2_auth_events_are_logged():
    admin = UserFactory.create(
        password=STRONG_PASSWORD,
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )
    client = APIClient()
    fail = client.post(
        "/api/v1/auth/tokens",
        {"username": admin.username, "password": "senha-invalida"},
        format="json",
    )
    assert fail.status_code == status.HTTP_401_UNAUTHORIZED
    assert AuditLog.objects.filter(event_type="auth.login_failed").exists()


def test_story_6_3_time_actions_are_audited(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Doing", position=1, wip_limit=2)
    task = Task.objects.create(board=board, group=group, title="Audit time", status="in_progress")
    start = admin_client.post(f"/api/v1/tasks/{task.pk}/time/start", {}, format="json")
    assert start.status_code == status.HTTP_200_OK
    pause = admin_client.post(f"/api/v1/tasks/{task.pk}/time/pause", {}, format="json")
    assert pause.status_code == status.HTTP_200_OK
    resume = admin_client.post(f"/api/v1/tasks/{task.pk}/time/resume", {}, format="json")
    assert resume.status_code == status.HTTP_200_OK
    complete = admin_client.post(f"/api/v1/tasks/{task.pk}/complete", {}, format="json")
    assert complete.status_code == status.HTTP_200_OK
    assert AuditLog.objects.filter(event_type="time.started", entity_type="time_log").exists()
    assert AuditLog.objects.filter(event_type="time.paused", entity_type="time_log").exists()
    assert AuditLog.objects.filter(event_type="time.resumed", entity_type="time_log").exists()
    assert AuditLog.objects.filter(event_type="time.completed", entity_type="time_log").exists()


def test_story_6_4_audit_dashboard_and_filtered_logs(admin_client):
    AuditLog.objects.create(event_type="ops.sample", action="create", entity_type="sample", entity_id="1")
    dashboard = admin_client.get("/api/v1/audit/dashboard")
    assert dashboard.status_code == status.HTTP_200_OK
    logs = admin_client.get("/api/v1/audit/logs", {"event_type": "ops.sample"})
    assert logs.status_code == status.HTTP_200_OK
    assert logs.data["meta"]["total"] >= 1


def test_story_6_6_stats_endpoints_return_scope_metrics(admin_client):
    workspace = WorkspaceFactory.create()
    portfolio = PortfolioFactory.create(workspace=workspace)
    project = ProjectFactory.create(portfolio=portfolio)
    board = Board.objects.create(project=project, name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=2)
    Task.objects.create(board=board, group=group, title="A", status="done")
    Task.objects.create(board=board, group=group, title="B", status="todo")
    ws = admin_client.get(f"/api/v1/workspaces/{workspace.pk}/stats")
    pf = admin_client.get(f"/api/v1/portfolios/{portfolio.pk}/stats")
    pr = admin_client.get(f"/api/v1/projects/{project.pk}/stats")
    assert ws.status_code == status.HTTP_200_OK
    assert pf.status_code == status.HTTP_200_OK
    assert pr.status_code == status.HTTP_200_OK
    assert pr.data["data"]["tasks_count"] == 2


def test_story_6_7_health_endpoint_returns_status(admin_client):
    response = admin_client.get("/api/v1/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["data"]["status"] == "ok"
    assert "timestamp" in response.data["data"]
