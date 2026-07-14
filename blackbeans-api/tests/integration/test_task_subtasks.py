from __future__ import annotations

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


def test_task_subtasks_create_list_and_board_roots_only(admin_client):
    board = Board.objects.create(project=ProjectFactory.create(), name="Board")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=10)

    parent_resp = admin_client.post(
        "/api/v1/tasks",
        {"group_id": str(group.pk), "title": "Dashboard sobre o site", "status": "todo"},
        format="json",
    )
    assert parent_resp.status_code == status.HTTP_201_CREATED
    parent_id = parent_resp.data["data"]["task"]["id"]
    assert parent_resp.data["data"]["task"]["parent_id"] is None
    assert parent_resp.data["data"]["task"]["subtasks_count"] == 0

    child_resp = admin_client.post(
        "/api/v1/tasks",
        {"parent_id": parent_id, "title": "page views e sessoes", "status": "todo", "priority": "high"},
        format="json",
    )
    assert child_resp.status_code == status.HTTP_201_CREATED
    child = child_resp.data["data"]["task"]
    assert child["parent_id"] == parent_id
    assert child["group_id"] == str(group.pk)
    assert child["board_id"] == str(board.pk)

    nested = admin_client.post(
        "/api/v1/tasks",
        {"parent_id": child["id"], "title": "sub-sub"},
        format="json",
    )
    assert nested.status_code == status.HTTP_400_BAD_REQUEST

    children = admin_client.get("/api/v1/tasks", {"parent_id": parent_id})
    assert children.status_code == status.HTTP_200_OK
    assert len(children.data["data"]["tasks"]) == 1

    board_list = admin_client.get(f"/api/v1/boards/{board.pk}", {"view": "list"})
    assert board_list.status_code == status.HTTP_200_OK
    titles = [t["title"] for t in board_list.data["data"]["tasks"]]
    assert titles == ["Dashboard sobre o site"]
    assert board_list.data["data"]["tasks"][0]["subtasks_count"] == 1

    parent_detail = admin_client.get(f"/api/v1/tasks/{parent_id}")
    assert parent_detail.status_code == status.HTTP_200_OK
    assert parent_detail.data["data"]["task"]["subtasks_count"] == 1
