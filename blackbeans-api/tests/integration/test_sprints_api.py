from __future__ import annotations

from datetime import date
from datetime import datetime
from datetime import time
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"
WEEK_START = date(2026, 8, 24)
WEEK_END = date(2026, 8, 28)


@pytest.fixture
def admin_user():
    return UserFactory.create(
        password=STRONG_PASSWORD,
        name="Admin Sprint",
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def collaborator():
    return UserFactory.create(
        password=STRONG_PASSWORD,
        name="Gabi Sprint",
        is_staff=False,
        is_superuser=False,
        is_active=True,
    )


def noon(day: date):
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(day, time(12, 0)), tz)


def make_board():
    board = Board.objects.create(project=ProjectFactory.create(), name="Board sprint")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=20)
    return board, group


def make_task(
    *,
    board,
    group,
    assignee,
    title,
    task_status="todo",
    start=None,
    end=None,
    recurring=False,
    always_in_sprint=False,
):
    return Task.objects.create(
        board=board,
        group=group,
        assignee=assignee,
        title=title,
        status=task_status,
        start_date=start,
        end_date=end,
        is_recurring=recurring,
        always_in_sprint=always_in_sprint,
        effort_points=2,
    )


def titles_from(response) -> set[str]:
    items = response.data["data"]["week"]["items"]
    return {item["title"] for item in items}


def item_by_title(response, title: str) -> dict:
    for item in response.data["data"]["week"]["items"]:
        if item["title"] == title:
            return item
    raise AssertionError(f"item not found: {title}")


def test_generate_includes_overlap_all_statuses_role_and_recurring(admin_client, admin_user, collaborator):
    board, group = make_board()
    wednesday = WEEK_START + timedelta(days=2)
    next_wednesday = WEEK_START + timedelta(days=9)
    previous_monday = WEEK_START - timedelta(days=7)
    previous_friday = WEEK_START - timedelta(days=3)

    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="A fazer na semana",
        task_status="todo",
        start=noon(WEEK_START),
        end=noon(wednesday),
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Concluida na semana",
        task_status="done",
        start=noon(WEEK_START),
        end=noon(WEEK_START + timedelta(days=1)),
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Comeca agora termina depois",
        task_status="in_progress",
        start=noon(WEEK_START + timedelta(days=3)),
        end=noon(next_wednesday),
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Comecou antes termina agora",
        task_status="in_progress",
        start=noon(previous_monday),
        end=noon(wednesday),
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Sem data",
        task_status="todo",
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Semana anterior",
        task_status="in_progress",
        start=noon(previous_monday),
        end=noon(previous_friday),
    )
    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Relatorio semanal",
        task_status="todo",
        start=noon(wednesday),
        end=noon(wednesday),
        recurring=True,
    )
    make_task(
        board=board,
        group=group,
        assignee=admin_user,
        title="Tarefa do admin",
        task_status="in_progress",
        start=noon(WEEK_START),
        end=noon(WEEK_END),
    )

    make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Reunioes internas",
        task_status="todo",
        always_in_sprint=True,
    )

    response = admin_client.post("/api/v1/sprints/generate", {"week_start": WEEK_START.isoformat()}, format="json")
    assert response.status_code == status.HTTP_200_OK
    found = titles_from(response)
    assert "A fazer na semana" in found
    assert "Concluida na semana" in found
    assert "Comeca agora termina depois" in found
    assert "Comecou antes termina agora" in found
    assert "Relatorio semanal" in found
    assert "Tarefa do admin" in found
    assert "Reunioes internas" in found
    assert "Sem data" not in found
    assert "Semana anterior" not in found

    recurring = item_by_title(response, "Relatorio semanal")
    assert recurring["is_recurring"] is True
    assert recurring["assignee_role"] == "collaborator"
    assert recurring["assignee_role_label"] == "Colaborador"

    pinned = item_by_title(response, "Reunioes internas")
    assert pinned["always_in_sprint"] is True

    admin_item = item_by_title(response, "Tarefa do admin")
    assert admin_item["assignee_role"] == "admin"
    assert admin_item["assignee_role_label"] == "Admin"
    assert admin_item["is_recurring"] is False


def test_patch_keeps_item_when_interval_still_overlaps_week(admin_client, collaborator):
    board, group = make_board()
    task = make_task(
        board=board,
        group=group,
        assignee=collaborator,
        title="Cruza a semana",
        task_status="in_progress",
        start=noon(WEEK_START),
        end=noon(WEEK_END),
    )
    generated = admin_client.post("/api/v1/sprints/generate", {"week_start": WEEK_START.isoformat()}, format="json")
    assert generated.status_code == status.HTTP_200_OK
    sprint_id = generated.data["data"]["week"]["id"]
    item = item_by_title(generated, "Cruza a semana")

    next_wednesday = (WEEK_START + timedelta(days=9)).isoformat()
    patched = admin_client.patch(
        f"/api/v1/sprints/{sprint_id}/items/{item['id']}",
        {"end_date": next_wednesday},
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["data"]["moved_out"] is False
    assert patched.data["data"]["item"]["id"] == item["id"]
    task.refresh_from_db()
    assert task.end_date is not None

    far_start = (WEEK_START + timedelta(days=14)).isoformat()
    far_end = (WEEK_START + timedelta(days=16)).isoformat()
    moved = admin_client.patch(
        f"/api/v1/sprints/{sprint_id}/items/{item['id']}",
        {"start_date": far_start, "end_date": far_end},
        format="json",
    )
    assert moved.status_code == status.HTTP_200_OK
    assert moved.data["data"]["moved_out"] is True
    assert moved.data["data"]["item"] is None
