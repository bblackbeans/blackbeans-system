from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.tests.factories import BoardFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def task():
    board = BoardFactory()
    group = BoardGroup.objects.create(board=board, name="Backlog", position=1)
    return Task.objects.create(board=board, group=group, title="Segredo")


@pytest.fixture
def outsider():
    client = APIClient()
    client.force_authenticate(UserFactory())
    return client


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/tasks/{id}/comments"),
        ("get", "/api/v1/tasks/{id}/activity"),
        ("get", "/api/v1/tasks/{id}/time-summary"),
        ("post", "/api/v1/tasks/{id}/time/pause"),
        ("post", "/api/v1/tasks/{id}/time/resume"),
    ],
)
def test_outsider_cannot_touch_task_of_other_workspace(outsider, task, method, path):
    response = getattr(outsider, method)(path.format(id=task.pk), {}, format="json")
    assert response.status_code == 403


def test_outsider_cannot_post_comment(outsider, task):
    response = outsider.post(f"/api/v1/tasks/{task.pk}/comments", {"content": "oi"}, format="json")
    assert response.status_code == 403
    assert task.comments.count() == 0


def test_outsider_cannot_read_board_progress(outsider, task):
    assert outsider.get(f"/api/v1/boards/{task.board_id}/progress").status_code == 403


def test_invalid_uuid_filter_is_400_not_500(task):
    admin = APIClient()
    admin.force_authenticate(UserFactory(is_staff=True))
    response = admin.get("/api/v1/tasks?board_id=nao-e-uuid")
    assert response.status_code == 400


def test_assign_unknown_user_is_400(task):
    admin = APIClient()
    admin.force_authenticate(UserFactory(is_staff=True))
    response = admin.patch(f"/api/v1/tasks/{task.pk}/assignee", {"assignee_id": 999999}, format="json")
    assert response.status_code == 400
