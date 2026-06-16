from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.email_rendering import build_unsubscribe_token
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import NotificationDigestItem
from blackbeans_api.governance.models import NotificationPreference
from blackbeans_api.governance.models import NotificationSubscription
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.tasks import send_notification_digest
from blackbeans_api.governance.tasks import send_notification_email
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.users.tests.factories import UserFactory
from tests.integration.auth_helpers import obtain_admin_access_token

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def user_client():
    user = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=False)
    client = APIClient()
    token = obtain_admin_access_token(client, username=user.username, password=STRONG_PASSWORD)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, user


def _task_with_board() -> Task:
    board = Board.objects.create(project=ProjectFactory.create(), name="Board QA")
    group = BoardGroup.objects.create(board=board, name="Todo", position=1, wip_limit=3)
    return Task.objects.create(board=board, group=group, title="Tarefa QA", status="todo")


def test_notification_preferences_defaults(user_client):
    client, user = user_client
    response = client.get("/api/v1/me/notification-preferences")
    assert response.status_code == status.HTTP_200_OK
    prefs = response.data["data"]["preferences"]
    assert len(prefs) == len(Notification.Type.values)
    assert NotificationPreference.objects.filter(user=user).count() == len(Notification.Type.values)


def test_notification_preferences_patch(user_client):
    client, _user = user_client
    response = client.patch(
        "/api/v1/me/notification-preferences",
        {
            "preferences": [
                {
                    "event_type": Notification.Type.ASSIGNED,
                    "in_app_enabled": True,
                    "email_mode": NotificationPreference.EmailMode.OFF,
                },
            ],
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assigned = next(
        row for row in response.data["data"]["preferences"] if row["event_type"] == Notification.Type.ASSIGNED
    )
    assert assigned["email_mode"] == NotificationPreference.EmailMode.OFF


def test_unsubscribe_token_disables_email(user_client):
    client, user = user_client
    token = build_unsubscribe_token(user_id=user.pk, event_type=Notification.Type.ASSIGNED)
    public = APIClient()
    response = public.get(f"/api/v1/notifications/unsubscribe?token={token}")
    assert response.status_code == status.HTTP_200_OK
    pref = NotificationPreference.objects.get(user=user, event_type=Notification.Type.ASSIGNED)
    assert pref.email_mode == NotificationPreference.EmailMode.OFF


def test_comment_creates_commented_and_mention_notifications(user_client):
    client, author = user_client
    mentioned = UserFactory.create(
        username="mencionado",
        email="mencionado@blackbeans.local",
        password=STRONG_PASSWORD,
        is_staff=True,
        is_active=True,
    )
    task = _task_with_board()
    response = client.post(
        f"/api/v1/tasks/{task.pk}/comments",
        {"content": f"Oi @{mentioned.username}, veja isso"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert Notification.objects.filter(
        user=mentioned,
        task=task,
        type=Notification.Type.MENTIONED,
    ).exists()


def test_task_watch_subscription(user_client):
    client, user = user_client
    task = _task_with_board()
    created = client.post(f"/api/v1/tasks/{task.pk}/watch", {}, format="json")
    assert created.status_code in {status.HTTP_200_OK, status.HTTP_201_CREATED}
    assert NotificationSubscription.objects.filter(
        user=user,
        target_type=NotificationSubscription.TargetType.TASK,
        target_id=task.pk,
    ).exists()
    deleted = client.delete(f"/api/v1/tasks/{task.pk}/watch")
    assert deleted.status_code == status.HTTP_200_OK
    assert not NotificationSubscription.objects.filter(user=user, target_id=task.pk).exists()


def test_notifications_read_all(user_client):
    client, user = user_client
    task = _task_with_board()
    Notification.objects.create(
        user=user,
        task=task,
        type=Notification.Type.ASSIGNED,
        title="A",
        message="B",
    )
    response = client.post("/api/v1/notifications/read-all", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert Notification.objects.filter(user=user, is_read=False).count() == 0


@patch("blackbeans_api.governance.tasks.EmailMultiAlternatives.send")
def test_send_notification_email_marks_sent(mock_send, user_client):
    _client, user = user_client
    task = _task_with_board()
    notification = Notification.objects.create(
        user=user,
        task=task,
        type=Notification.Type.ASSIGNED,
        title="Designada",
        message="Voce foi designado",
        metadata={"task_title": task.title, "deep_link": "http://localhost/#tasks?task=1"},
    )
    result = send_notification_email(str(notification.pk))
    assert result == "sent"
    notification.refresh_from_db()
    assert notification.email_sent_at is not None
    mock_send.assert_called_once()


def test_send_notification_digest_groups_items(user_client, settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    client, user = user_client
    task = _task_with_board()
    n1 = Notification.objects.create(
        user=user,
        task=task,
        type=Notification.Type.COMPLETED,
        title="N1",
        message="M1",
        metadata={"deep_link": "http://localhost"},
    )
    n2 = Notification.objects.create(
        user=user,
        task=task,
        type=Notification.Type.UPDATED,
        title="N2",
        message="M2",
        metadata={"deep_link": "http://localhost"},
    )
    now = timezone.now()
    NotificationDigestItem.objects.create(
        notification=n1,
        user=user,
        digest_mode=NotificationPreference.EmailMode.DAILY,
        scheduled_for=now,
    )
    NotificationDigestItem.objects.create(
        notification=n2,
        user=user,
        digest_mode=NotificationPreference.EmailMode.DAILY,
        scheduled_for=now,
    )
    result = send_notification_digest(str(user.pk), NotificationPreference.EmailMode.DAILY)
    assert result.startswith("sent:")
    assert len(mail.outbox) == 1
    n1.refresh_from_db()
    assert n1.digest_sent_at is not None
