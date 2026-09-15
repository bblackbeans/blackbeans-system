"""Escopo de acesso a tarefas para colaboradores (workspace + assignee)."""

from __future__ import annotations

from django.db.models import Q
from django.db.models import QuerySet

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Task
from blackbeans_api.users.models import UserWorkspaceAccess


def user_is_ops_admin(user) -> bool:
    return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def workspace_ids_for_user(user) -> list:
    if user_is_ops_admin(user):
        return []
    return list(
        UserWorkspaceAccess.objects.filter(user=user).values_list("workspace_id", flat=True),
    )


def tasks_queryset_for_user(user) -> QuerySet[Task]:
    qs = Task.objects.all()
    if user_is_ops_admin(user):
        return qs
    workspace_ids = workspace_ids_for_user(user)
    if workspace_ids:
        return qs.filter(
            Q(board__project__portfolio__workspace_id__in=workspace_ids) | Q(assignee_id=user.pk),
        )
    return qs.filter(assignee_id=user.pk)


def user_can_access_task(user, task: Task) -> bool:
    if user_is_ops_admin(user):
        return True
    if task.assignee_id == user.pk:
        return True
    workspace_ids = workspace_ids_for_user(user)
    if not workspace_ids:
        return False
    workspace_id = (
        Task.objects.filter(pk=task.pk)
        .values_list("board__project__portfolio__workspace_id", flat=True)
        .first()
    )
    return workspace_id in workspace_ids


def user_can_mutate_task(user, task: Task) -> bool:
    """Colaborador pode alterar tarefas do seu workspace ou atribuídas a ele."""
    return user_can_access_task(user, task)


def user_can_delete_task(user, task: Task) -> bool:
    return user_is_ops_admin(user)


def user_can_access_board(user, board: Board) -> bool:
    if user_is_ops_admin(user):
        return True
    workspace_ids = workspace_ids_for_user(user)
    if not workspace_ids:
        return False
    workspace_id = (
        Board.objects.filter(pk=board.pk)
        .values_list("project__portfolio__workspace_id", flat=True)
        .first()
    )
    return workspace_id in workspace_ids


def boards_queryset_for_user(user) -> QuerySet[Board]:
    qs = Board.objects.select_related("project__portfolio").all()
    if user_is_ops_admin(user):
        return qs
    workspace_ids = workspace_ids_for_user(user)
    if not workspace_ids:
        return qs.none()
    return qs.filter(project__portfolio__workspace_id__in=workspace_ids)
