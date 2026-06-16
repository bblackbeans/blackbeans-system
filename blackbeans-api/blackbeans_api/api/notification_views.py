from __future__ import annotations

from uuid import UUID

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.email_rendering import parse_unsubscribe_token
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import NotificationPreference
from blackbeans_api.governance.models import NotificationSubscription
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.notification_service import preferences_to_list
from blackbeans_api.governance.notification_service import update_preferences


class MeNotificationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        return success_response(
            correlation_id=correlation_id,
            data={"preferences": preferences_to_list(request.user)},
        )

    def patch(self, request: Request):
        correlation_id = get_correlation_id(request)
        items = request.data.get("preferences")
        if not isinstance(items, list):
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Envie preferences como lista.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        updated = update_preferences(request.user, items)
        return success_response(correlation_id=correlation_id, data={"preferences": updated})


class NotificationUnsubscribeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        token = str(request.query_params.get("token", "")).strip()
        payload = parse_unsubscribe_token(token) if token else None
        if not payload:
            return error_response(
                correlation_id=correlation_id,
                code="invalid_token",
                message="Token de descadastro invalido ou expirado.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        user_id = int(payload["user_id"])
        event_type = str(payload["event_type"])
        NotificationPreference.objects.filter(user_id=user_id, event_type=event_type).update(
            email_mode=NotificationPreference.EmailMode.OFF,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"unsubscribed": True, "event_type": event_type},
        )


class MeNotificationSubscriptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        rows = NotificationSubscription.objects.filter(user=request.user).order_by("-created_at")
        return success_response(
            correlation_id=correlation_id,
            data={
                "subscriptions": [
                    {
                        "id": str(row.pk),
                        "target_type": row.target_type,
                        "target_id": str(row.target_id),
                        "created_at": row.created_at.isoformat().replace("+00:00", "Z"),
                    }
                    for row in rows
                ],
            },
        )


class TaskWatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, task_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="task_not_found",
                message="Tarefa nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        sub, created = NotificationSubscription.objects.get_or_create(
            user=request.user,
            target_type=NotificationSubscription.TargetType.TASK,
            target_id=task.pk,
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "subscription": {
                    "id": str(sub.pk),
                    "target_type": sub.target_type,
                    "target_id": str(sub.target_id),
                },
                "created": created,
            },
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request: Request, task_id: UUID):
        correlation_id = get_correlation_id(request)
        deleted, _ = NotificationSubscription.objects.filter(
            user=request.user,
            target_type=NotificationSubscription.TargetType.TASK,
            target_id=task_id,
        ).delete()
        return success_response(correlation_id=correlation_id, data={"deleted": deleted > 0})


class BoardWatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Quadro nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        sub, created = NotificationSubscription.objects.get_or_create(
            user=request.user,
            target_type=NotificationSubscription.TargetType.BOARD,
            target_id=board.pk,
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "subscription": {
                    "id": str(sub.pk),
                    "target_type": sub.target_type,
                    "target_id": str(sub.target_id),
                },
                "created": created,
            },
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        deleted, _ = NotificationSubscription.objects.filter(
            user=request.user,
            target_type=NotificationSubscription.TargetType.BOARD,
            target_id=board_id,
        ).delete()
        return success_response(correlation_id=correlation_id, data={"deleted": deleted > 0})


class NotificationsReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        now = timezone.now()
        updated = Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True,
            read_at=now,
        )
        return success_response(correlation_id=correlation_id, data={"updated": updated})
