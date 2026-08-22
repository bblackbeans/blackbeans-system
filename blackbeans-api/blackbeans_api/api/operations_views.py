from __future__ import annotations

import logging
from datetime import timedelta
from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.operations_serializers import PortfolioWriteSerializer
from blackbeans_api.api.operations_serializers import ProjectWriteSerializer
from blackbeans_api.api.operations_serializers import WorkspaceWriteSerializer
from blackbeans_api.api.operations_serializers import BoardWriteSerializer
from blackbeans_api.api.operations_serializers import BoardUpdateSerializer
from blackbeans_api.api.operations_serializers import board_to_representation
from blackbeans_api.api.operations_serializers import BoardGroupCreateSerializer
from blackbeans_api.api.operations_serializers import BoardGroupUpdateSerializer
from blackbeans_api.api.operations_serializers import board_group_to_representation
from blackbeans_api.api.operations_serializers import TaskWriteSerializer
from blackbeans_api.api.operations_serializers import TaskAssigneeSerializer
from blackbeans_api.api.operations_serializers import TaskAttachmentCreateSerializer
from blackbeans_api.api.operations_serializers import TaskCommentCreateSerializer
from blackbeans_api.api.operations_serializers import TaskCommentUpdateSerializer
from blackbeans_api.api.operations_serializers import TaskDependencyCreateSerializer
from blackbeans_api.api.operations_serializers import notification_to_representation
from blackbeans_api.api.operations_serializers import task_to_representation
from blackbeans_api.api.operations_serializers import TimeLogManualCreateSerializer
from blackbeans_api.api.operations_serializers import TimeLogUpdateSerializer
from blackbeans_api.api.operations_serializers import time_log_to_representation
from blackbeans_api.api.operations_serializers import task_comment_to_representation
from blackbeans_api.api.operations_serializers import task_attachment_to_representation
from blackbeans_api.api.operations_serializers import validate_active_task_status
from blackbeans_api.api.operations_serializers import MAX_ATTACHMENT_BYTES
from blackbeans_api.api.operations_serializers import portfolio_to_representation
from blackbeans_api.api.operations_serializers import project_to_representation
from blackbeans_api.api.operations_serializers import workspace_to_representation
from blackbeans_api.api.permissions import IsAuthenticatedReadElseStaff
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.permissions import IsSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskActivity
from blackbeans_api.governance.models import TaskAttachment
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import TaskDependency
from blackbeans_api.governance.models import TimeLog
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.audit import log_audit_event
from blackbeans_api.governance.board_status import apply_status_from_group
from blackbeans_api.governance.board_status import done_catalog_key
from blackbeans_api.governance.board_status import ensure_canonical_groups
from blackbeans_api.governance.board_status import realign_project_tasks_by_pull_status
from blackbeans_api.governance.board_status import status_bucket
from blackbeans_api.governance.board_status import status_bucket_for_task
from blackbeans_api.governance.board_status import sync_task_board_by_pull_status
from blackbeans_api.governance.board_status import sync_task_group_by_status
from blackbeans_api.governance.board_status import validate_pull_status_keys_unique
from blackbeans_api.governance.notification_service import dispatch_task_comment
from blackbeans_api.governance.notification_service import dispatch_task_mentions
from blackbeans_api.governance.notification_service import dispatch_task_priority_changed
from blackbeans_api.governance.notification_service import dispatch_task_status_changed
from blackbeans_api.governance.notification_service import dispatch_task_updated
from blackbeans_api.governance.notification_service import get_user_display_name
from blackbeans_api.governance.tasks import dispatch_deadline_notifications
from blackbeans_api.governance.tasks import dispatch_task_assigned_notification
from blackbeans_api.governance.tasks import dispatch_task_completed_notifications

logger = logging.getLogger(__name__)


def _actor_id(request: Request) -> str:
    return str(request.user.pk)


def _log_task_activity(*, task: Task, actor_id: int, event_type: str, summary: str) -> None:
    TaskActivity.objects.create(
        task=task,
        actor_id=actor_id,
        event_type=event_type,
        summary=summary,
    )


_TASK_FIELD_LABELS_PT = {
    "title": "Titulo",
    "description": "Descricao",
    "status": "Status",
    "priority": "Prioridade",
    "effort_points": "Horas previstas",
    "assignee_id": "Responsavel",
    "assignee": "Responsavel",
    "start_date": "Prazo de inicio",
    "end_date": "Prazo final",
    "is_recurring": "Recorrencia",
    "recurrence_frequency": "Frequencia de recorrencia",
    "board_id": "Quadro",
    "group_id": "Grupo",
    "parent_id": "Tarefa pai",
}

_TASK_STATUS_LABELS_PT = {
    "todo": "A fazer",
    "in_progress": "Em andamento",
    "blocked": "Bloqueada",
    "done": "Concluida",
}

_TASK_PRIORITY_LABELS_PT = {
    "low": "Baixa",
    "medium": "Media",
    "high": "Alta",
    "critical": "Critica",
}


def _status_label_pt(value: str | None) -> str:
    key = str(value or "").strip().lower()
    return _TASK_STATUS_LABELS_PT.get(key, str(value or "—"))


def _priority_label_pt(value: str | None) -> str:
    key = str(value or "").strip().lower()
    return _TASK_PRIORITY_LABELS_PT.get(key, str(value or "—"))


def _humanize_changed_fields(fields: list[str]) -> str:
    labels = [_TASK_FIELD_LABELS_PT.get(field, field.replace("_", " ")) for field in fields]
    if not labels:
        return "Tarefa atualizada."
    return f"Campos alterados: {', '.join(labels)}."


def _comment_activity_snippet(content: str, *, limit: int = 140) -> str:
    clean = " ".join(str(content or "").split())
    if not clean:
        return ""
    if len(clean) <= limit:
        return clean
    return f"{clean[: limit - 1]}…"

def _close_open_time_logs_for_task(task: Task, *, now=None) -> int:
    """Encerra logs ACTIVE/PAUSED da tarefa, acumulando tempo parcial."""
    now = now or timezone.now()
    closed = 0
    for time_log in TimeLog.objects.filter(
        task=task,
        status__in=[TimeLog.Status.ACTIVE, TimeLog.Status.PAUSED],
    ):
        elapsed = int((now - time_log.current_started_at).total_seconds()) if time_log.current_started_at else 0
        time_log.accumulated_seconds += max(elapsed, 0)
        time_log.current_started_at = None
        time_log.ended_at = now
        time_log.status = TimeLog.Status.COMPLETED
        time_log.save(
            update_fields=[
                "accumulated_seconds",
                "current_started_at",
                "ended_at",
                "status",
                "updated_at",
            ],
        )
        closed += 1
    return closed


def _resolve_time_log_for_user(
    *,
    task: Task,
    user,
    status_value: str,
    allow_staff_fallback: bool = False,
) -> TimeLog | None:
    """Resolve sessao do usuario; staff pode operar sessao aberta de outro usuario."""
    own = (
        TimeLog.objects.filter(task=task, user=user, status=status_value)
        .order_by("-updated_at")
        .first()
    )
    if own is not None:
        return own
    if allow_staff_fallback and bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)):
        return (
            TimeLog.objects.filter(task=task, status=status_value)
            .order_by("-updated_at")
            .first()
        )
    return None


def _complete_other_open_time_logs(*, task: Task, user, keep_id, now=None) -> int:
    """Encerra outras sessoes ACTIVE/PAUSED do mesmo usuario na tarefa (evita active+paused)."""
    now = now or timezone.now()
    closed = 0
    for time_log in TimeLog.objects.filter(
        task=task,
        user=user,
        status__in=[TimeLog.Status.ACTIVE, TimeLog.Status.PAUSED],
    ).exclude(pk=keep_id):
        elapsed = int((now - time_log.current_started_at).total_seconds()) if time_log.current_started_at else 0
        time_log.accumulated_seconds += max(elapsed, 0)
        time_log.current_started_at = None
        time_log.ended_at = now
        time_log.status = TimeLog.Status.COMPLETED
        time_log.save(
            update_fields=[
                "accumulated_seconds",
                "current_started_at",
                "ended_at",
                "status",
                "updated_at",
            ],
        )
        closed += 1
    return closed


def _local_date_sao_paulo(dt):
    from zoneinfo import ZoneInfo

    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.utc)
    return dt.astimezone(ZoneInfo("America/Sao_Paulo")).date()


def _resume_paused_time_log(*, time_log: TimeLog, now=None) -> tuple[TimeLog, bool]:
    """
    Retoma sessao pausada.

    Se a sessao comecou em outro dia (America/Sao_Paulo), encerra a antiga e abre
    uma nova — assim horas do dashboard (filtro por started_at) caem na data certa.
    Returns (log_ativo, split_criado).
    """
    now = now or timezone.now()
    started_day = _local_date_sao_paulo(time_log.started_at)
    today = _local_date_sao_paulo(now)
    if started_day is not None and today is not None and started_day < today:
        time_log.current_started_at = None
        time_log.ended_at = now
        time_log.status = TimeLog.Status.COMPLETED
        time_log.save(
            update_fields=[
                "current_started_at",
                "ended_at",
                "status",
                "updated_at",
            ],
        )
        new_log = TimeLog.objects.create(
            task=time_log.task,
            user=time_log.user,
            status=TimeLog.Status.ACTIVE,
            started_at=now,
            current_started_at=now,
            is_manual=False,
            source="timer",
        )
        _complete_other_open_time_logs(task=time_log.task, user=time_log.user, keep_id=new_log.pk, now=now)
        return new_log, True

    time_log.current_started_at = now
    time_log.status = TimeLog.Status.ACTIVE
    time_log.save(update_fields=["current_started_at", "status", "updated_at"])
    _complete_other_open_time_logs(task=time_log.task, user=time_log.user, keep_id=time_log.pk, now=now)
    return time_log, False


def _recalculate_dependents(task: Task) -> None:
    """Propaga ajuste de datas em cadeia (BFS) a partir do predecessor."""
    if task.end_date is None:
        return
    queue = [task]
    seen: set = {task.pk}
    while queue:
        current = queue.pop(0)
        if current.end_date is None:
            continue
        deps = TaskDependency.objects.select_related("task").filter(depends_on=current)
        for dep in deps:
            dependent = dep.task
            if dependent.pk in seen:
                continue
            if dependent.start_date is None or dependent.start_date < current.end_date:
                duration = None
                if dependent.start_date and dependent.end_date and dependent.end_date >= dependent.start_date:
                    duration = dependent.end_date - dependent.start_date
                dependent.start_date = current.end_date
                if duration is not None:
                    dependent.end_date = dependent.start_date + duration
                dependent.save(update_fields=["start_date", "end_date", "updated_at"])
            seen.add(dependent.pk)
            queue.append(dependent)


_RECURRENCE_DELTAS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
    "biweekly": timedelta(days=14),
    "monthly": timedelta(days=30),
}


def _spawn_next_recurrence(task: Task) -> Task | None:
    """Cria a proxima ocorrencia de uma tarefa recorrente ao concluir."""
    if not getattr(task, "is_recurring", False):
        return None
    freq = (getattr(task, "recurrence_frequency", None) or "").strip().lower()
    delta = _RECURRENCE_DELTAS.get(freq)
    if delta is None:
        return None
    anchor = task.recurrence_anchor_task or task
    # Evita duplicar se ja existe filho aberto gerado a partir desta conclusao recente
    if Task.objects.filter(
        recurrence_anchor_task=anchor,
        is_recurring=True,
        status=Task.Status.TODO,
        created_at__gte=timezone.now() - timedelta(minutes=5),
    ).exclude(pk=task.pk).exists():
        return None
    base_start = task.start_date or task.end_date or timezone.now()
    base_end = task.end_date or base_start
    duration = base_end - base_start if base_end >= base_start else timedelta(0)
    next_start = base_start + delta
    next_end = next_start + duration
    spawned = Task.objects.create(
        board=task.board,
        group=task.group,
        parent=task.parent,
        title=task.title,
        description=task.description,
        status=Task.Status.TODO,
        priority=task.priority,
        effort_points=task.effort_points,
        assignee=task.assignee,
        start_date=next_start,
        end_date=next_end,
        is_recurring=True,
        recurrence_frequency=freq,
        recurrence_anchor_task=anchor,
    )
    _sync_task_placement_by_status(spawned)
    spawned.refresh_from_db()
    return spawned


def _has_in_progress_tasks_workspace(*, workspace_id: UUID) -> bool:
    return Task.objects.filter(
        board__project__portfolio__workspace_id=workspace_id,
        status=Task.Status.IN_PROGRESS,
    ).exists()


def _has_in_progress_tasks_portfolio(*, portfolio_id: UUID) -> bool:
    return Task.objects.filter(
        board__project__portfolio_id=portfolio_id,
        status=Task.Status.IN_PROGRESS,
    ).exists()


def _has_in_progress_tasks_project(*, project_id: UUID) -> bool:
    return Task.objects.filter(board__project_id=project_id, status=Task.Status.IN_PROGRESS).exists()


def _has_in_progress_tasks_board(*, board_id: UUID) -> bool:
    return Task.objects.filter(board_id=board_id, status=Task.Status.IN_PROGRESS).exists()


def _has_in_progress_tasks_group(*, group_id: UUID) -> bool:
    return Task.objects.filter(group_id=group_id, status=Task.Status.IN_PROGRESS).exists()


def _sync_task_group_by_status(task: Task) -> bool:
    """Move a tarefa para o grupo do board conforme o status. Retorna True se mudou."""
    return sync_task_group_by_status(task)


def _sync_task_placement_by_status(task: Task) -> bool:
    """Puxa para o board configurado e depois alinha a coluna interna."""
    moved_board = sync_task_board_by_pull_status(task)
    if moved_board:
        task.refresh_from_db()
    moved_group = sync_task_group_by_status(task)
    return moved_board or moved_group


class WorkspaceListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        rows = Workspace.objects.order_by("name")
        return success_response(
            correlation_id=correlation_id,
            data={"workspaces": [workspace_to_representation(item) for item in rows]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = WorkspaceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = serializer.save()
        log_audit_event(
            event_type="workspace.created",
            action="create",
            entity_type="workspace",
            entity_id=str(workspace.pk),
            actor_id=request.user.pk,
            workspace_id=str(workspace.pk),
            correlation_id=correlation_id,
            after={"name": workspace.name, "client_id": str(workspace.client_id) if workspace.client_id else None},
        )
        logger.info(
            "ops.workspace.created actor_id=%s correlation_id=%s workspace_id=%s",
            _actor_id(request),
            correlation_id,
            str(workspace.pk),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"workspace": workspace_to_representation(workspace)},
            http_status=status.HTTP_201_CREATED,
        )


class WorkspaceDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, workspace_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = WorkspaceWriteSerializer(workspace, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before = workspace_to_representation(workspace)
        serializer.save()
        log_audit_event(
            event_type="workspace.updated",
            action="update",
            entity_type="workspace",
            entity_id=str(workspace.pk),
            actor_id=request.user.pk,
            workspace_id=str(workspace.pk),
            correlation_id=correlation_id,
            before=before,
            after=workspace_to_representation(workspace),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"workspace": workspace_to_representation(workspace)},
        )

    def delete(self, request: Request, workspace_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        if _has_in_progress_tasks_workspace(workspace_id=workspace_id):
            return error_response(
                correlation_id=correlation_id,
                code="workspace_has_tasks_in_progress",
                message="Nao e possivel excluir: existem tarefas em progresso nesta area de trabalho.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        if Portfolio.objects.filter(workspace=workspace).exists():
            return error_response(
                correlation_id=correlation_id,
                code="workspace_has_dependencies",
                message="Workspace possui dependencias e nao pode ser excluido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        before = workspace_to_representation(workspace)
        workspace.delete()
        log_audit_event(
            event_type="workspace.deleted",
            action="delete",
            entity_type="workspace",
            entity_id=str(workspace_id),
            actor_id=request.user.pk,
            correlation_id=correlation_id,
            before=before,
            metadata={"deleted_workspace_id": str(workspace_id)},
        )
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class PortfolioListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        rows = Portfolio.objects.order_by("name")
        return success_response(
            correlation_id=correlation_id,
            data={"portfolios": [portfolio_to_representation(item) for item in rows]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = PortfolioWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        portfolio = serializer.save()
        logger.info(
            "ops.portfolio.created actor_id=%s correlation_id=%s portfolio_id=%s workspace_id=%s",
            _actor_id(request),
            correlation_id,
            str(portfolio.pk),
            str(portfolio.workspace_id),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"portfolio": portfolio_to_representation(portfolio)},
            http_status=status.HTTP_201_CREATED,
        )


class PortfolioDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, portfolio_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            portfolio = Portfolio.objects.get(pk=portfolio_id)
        except Portfolio.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="portfolio_not_found",
                message="Portfolio nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PortfolioWriteSerializer(portfolio, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            correlation_id=correlation_id,
            data={"portfolio": portfolio_to_representation(portfolio)},
        )

    def delete(self, request: Request, portfolio_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            portfolio = Portfolio.objects.get(pk=portfolio_id)
        except Portfolio.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="portfolio_not_found",
                message="Portfolio nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if _has_in_progress_tasks_portfolio(portfolio_id=portfolio_id):
            return error_response(
                correlation_id=correlation_id,
                code="portfolio_has_tasks_in_progress",
                message="Nao e possivel excluir: existem tarefas em progresso neste portfolio.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if Project.objects.filter(portfolio=portfolio).exists():
            return error_response(
                correlation_id=correlation_id,
                code="portfolio_has_dependencies",
                message="Portfolio possui projetos e nao pode ser excluido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        portfolio.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class ProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        rows = Project.objects.select_related("portfolio__workspace").order_by("name")
        return success_response(
            correlation_id=correlation_id,
            data={"projects": [project_to_representation(item) for item in rows]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = ProjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = serializer.save()
        logger.info(
            "ops.project.created actor_id=%s correlation_id=%s project_id=%s portfolio_id=%s client_id=%s",
            _actor_id(request),
            correlation_id,
            str(project.pk),
            str(project.portfolio_id),
            str(project.client_id) if project.client_id else "",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"project": project_to_representation(project)},
            http_status=status.HTTP_201_CREATED,
        )


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.select_related("portfolio__workspace").get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            correlation_id=correlation_id,
            data={"project": project_to_representation(project)},
        )

    def delete(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if _has_in_progress_tasks_project(project_id=project_id):
            return error_response(
                correlation_id=correlation_id,
                code="project_has_tasks_in_progress",
                message="Nao e possivel excluir: existem tarefas em progresso neste projeto.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if Board.objects.filter(project=project).exists():
            return error_response(
                correlation_id=correlation_id,
                code="project_has_dependencies",
                message="Projeto possui boards e nao pode ser excluido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        project.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class ProjectStatusView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        raw_status = request.data.get("status")
        if raw_status not in dict(Project.Status.choices):
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Status de projeto invalido.",
                details={"status": ["Use um status valido."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        before = project.status
        project.status = raw_status
        project.save(update_fields=["status", "updated_at"])
        logger.info(
            "ops.project.status_updated actor_id=%s correlation_id=%s project_id=%s before=%s after=%s",
            _actor_id(request),
            correlation_id,
            str(project.pk),
            before,
            project.status,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"project": project_to_representation(project)},
        )


class ProjectScheduleView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProjectWriteSerializer(
            project,
            data={
                "start_date": request.data.get("start_date", project.start_date),
                "end_date": request.data.get("end_date", project.end_date),
                "actual_start_date": request.data.get("actual_start_date", project.actual_start_date),
                "actual_end_date": request.data.get("actual_end_date", project.actual_end_date),
            },
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            correlation_id=correlation_id,
            data={"project": project_to_representation(project)},
        )


class ProjectMetricsView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        progress_percent = 100 if project.status == Project.Status.COMPLETED else 0
        risk_level = "low"
        now = timezone.now()
        if project.status == Project.Status.AT_RISK:
            risk_level = "high"
        elif project.end_date and project.end_date < now and project.status != Project.Status.COMPLETED:
            risk_level = "high"
        elif project.end_date and project.end_date <= now + timedelta(days=7):
            risk_level = "medium"

        return success_response(
            correlation_id=correlation_id,
            data={
                "project_id": str(project.pk),
                "progress_percent": progress_percent,
                "risk_level": risk_level,
                "status": project.status,
            },
        )


class WorkspaceStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, workspace_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        projects = Project.objects.filter(portfolio__workspace=workspace)
        tasks = Task.objects.filter(board__project__portfolio__workspace=workspace)
        return success_response(
            correlation_id=correlation_id,
            data={
                "workspace_id": str(workspace.pk),
                "projects_count": projects.count(),
                "active_projects_count": projects.filter(status=Project.Status.ACTIVE).count(),
                "tasks_count": tasks.count(),
                "done_tasks_count": tasks.filter(status=Task.Status.DONE).count(),
            },
        )


class PortfolioStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, portfolio_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            portfolio = Portfolio.objects.get(pk=portfolio_id)
        except Portfolio.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="portfolio_not_found",
                message="Portfolio nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        projects = Project.objects.filter(portfolio=portfolio)
        tasks = Task.objects.filter(board__project__portfolio=portfolio)
        return success_response(
            correlation_id=correlation_id,
            data={
                "portfolio_id": str(portfolio.pk),
                "workspace_id": str(portfolio.workspace_id),
                "projects_count": projects.count(),
                "at_risk_projects_count": projects.filter(status=Project.Status.AT_RISK).count(),
                "tasks_count": tasks.count(),
                "done_tasks_count": tasks.filter(status=Task.Status.DONE).count(),
            },
        )


class ProjectStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, project_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="project_not_found",
                message="Projeto nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        tasks = Task.objects.filter(board__project=project)
        total = tasks.count()
        done = tasks.filter(status=Task.Status.DONE).count()
        return success_response(
            correlation_id=correlation_id,
            data={
                "project_id": str(project.pk),
                "workspace_id": str(project.portfolio.workspace_id),
                "tasks_count": total,
                "done_tasks_count": done,
                "progress_percent": 0 if total == 0 else int((done * 100) / total),
            },
        )


class BoardListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = Board.objects.select_related("project__portfolio").order_by("created_at")
        project_id = request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return success_response(
            correlation_id=correlation_id,
            data={"boards": [board_to_representation(board) for board in queryset]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = BoardWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        board = serializer.save()
        logger.info(
            "ops.board.created actor_id=%s correlation_id=%s board_id=%s project_id=%s workspace_id=%s",
            _actor_id(request),
            correlation_id,
            str(board.pk),
            str(board.project_id),
            str(board.project.portfolio.workspace_id),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"board": board_to_representation(board)},
            http_status=status.HTTP_201_CREATED,
        )


class BoardGroupListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        groups = BoardGroup.objects.filter(board=board).order_by("position")
        return success_response(
            correlation_id=correlation_id,
            data={"groups": [board_group_to_representation(group) for group in groups]},
        )

    def post(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BoardGroupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_position = (
            BoardGroup.objects.filter(board=board).order_by("-position").values_list("position", flat=True).first()
            or 0
        ) + 1
        group = BoardGroup.objects.create(
            board=board,
            name=serializer.validated_data["name"],
            wip_limit=serializer.validated_data["wip_limit"],
            position=next_position,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"group": board_group_to_representation(group)},
            http_status=status.HTTP_201_CREATED,
        )


class BoardGroupDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, group_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            group = BoardGroup.objects.select_related("board").get(pk=group_id)
        except BoardGroup.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="group_not_found",
                message="Grupo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BoardGroupUpdateSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if "position" in serializer.validated_data:
                target_position = serializer.validated_data["position"]
                group.position = 0
                group.save(update_fields=["position", "updated_at"])
                ordered = list(
                    BoardGroup.objects.filter(board=group.board)
                    .exclude(pk=group.pk)
                    .order_by("position", "created_at")
                )
                max_position = len(ordered) + 1
                target_position = min(target_position, max_position)
                for idx, row in enumerate(ordered, start=1):
                    row.position = idx if idx < target_position else idx + 1
                    row.save(update_fields=["position", "updated_at"])
                serializer.validated_data["position"] = target_position

            serializer.save()

        return success_response(
            correlation_id=correlation_id,
            data={"group": board_group_to_representation(group)},
        )

    def delete(self, request: Request, group_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            group = BoardGroup.objects.select_related("board").get(pk=group_id)
        except BoardGroup.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="group_not_found",
                message="Grupo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if _has_in_progress_tasks_group(group_id=group_id):
            return error_response(
                correlation_id=correlation_id,
                code="group_has_tasks_in_progress",
                message="Nao e possivel excluir: existem tarefas em progresso nesta coluna.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        board_id = group.board_id
        group.delete()
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "board_id": str(board_id)},
        )


class BoardDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.select_related("project").get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        view = request.query_params.get("view", "list")
        if view not in {"list", "kanban", "timeline"}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Parametro view invalido.",
                details={"view": ["Use list, kanban ou timeline."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if view == "timeline" and not request.user.is_superuser:
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Perfil sem permissao para visualizacao timeline.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )

        tasks = (
            Task.objects.filter(board=board, parent__isnull=True)
            .select_related("group", "assignee")
            .annotate(subtasks_count=Count("subtasks"))
            .order_by("group__position", "created_at")
        )
        if view == "list":
            payload = {"view": "list", "tasks": [task_to_representation(t) for t in tasks]}
        elif view == "kanban":
            canonical = ensure_canonical_groups(board)
            buckets = ("backlog", "progress", "done")
            grouped: dict[str, list] = {key: [] for key in buckets}
            for task in tasks:
                grouped[status_bucket_for_task(task)].append(task)
            payload_groups = []
            for key in buckets:
                group = canonical[key]
                payload_groups.append(
                    {
                        "group": board_group_to_representation(group),
                        "tasks": [task_to_representation(t) for t in grouped[key]],
                    },
                )
            payload = {"view": "kanban", "groups": payload_groups}
        else:
            payload = {"view": "timeline", "tasks": [task_to_representation(t) for t in tasks]}

        return success_response(correlation_id=correlation_id, data={"board": board_to_representation(board), **payload})

    def patch(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.select_related("project", "project__portfolio").get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BoardUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not data:
            return success_response(
                correlation_id=correlation_id,
                data={"board": board_to_representation(board), "realigned": 0},
            )

        realigned = 0
        if "pull_status_keys" in data:
            conflicts = validate_pull_status_keys_unique(
                project_id=board.project_id,
                board_id=board.pk,
                keys=data["pull_status_keys"],
            )
            if conflicts:
                return error_response(
                    correlation_id=correlation_id,
                    code="pull_status_conflict",
                    message=(
                        "Status ja configurado em outro quadro do projeto: "
                        + ", ".join(conflicts)
                    ),
                    details={"conflicts": conflicts},
                    http_status=status.HTTP_409_CONFLICT,
                )

        with transaction.atomic():
            update_fields: list[str] = []
            if "name" in data:
                board.name = data["name"]
                update_fields.append("name")
            if "pull_status_keys" in data:
                board.pull_status_keys = data["pull_status_keys"]
                update_fields.append("pull_status_keys")
            if update_fields:
                update_fields.append("updated_at")
                board.save(update_fields=update_fields)
            if "pull_status_keys" in data:
                realigned = realign_project_tasks_by_pull_status(project_id=board.project_id)

        board = Board.objects.select_related("project", "project__portfolio").get(pk=board.pk)
        return success_response(
            correlation_id=correlation_id,
            data={"board": board_to_representation(board), "realigned": realigned},
        )

    def delete(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if _has_in_progress_tasks_board(board_id=board_id):
            return error_response(
                correlation_id=correlation_id,
                code="board_has_tasks_in_progress",
                message="Nao e possivel excluir: existem tarefas em progresso neste quadro.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        project_id = str(board.project_id)
        board.delete()
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "project_id": project_id},
        )


class TaskListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = (
            Task.objects.select_related("group", "board", "assignee")
            .annotate(subtasks_count=Count("subtasks"))
            .order_by("created_at")
        )
        board_id = request.query_params.get("board_id")
        group_id = request.query_params.get("group_id")
        parent_id = request.query_params.get("parent_id")
        status_filter = request.query_params.get("status")
        search = (request.query_params.get("search") or "").strip()
        roots_only = (request.query_params.get("roots_only") or "").strip().lower()

        if board_id:
            queryset = queryset.filter(board_id=board_id)
        if group_id:
            queryset = queryset.filter(group_id=group_id)
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        elif roots_only in {"1", "true", "yes"}:
            queryset = queryset.filter(parent__isnull=True)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if search:
            queryset = queryset.filter(title__icontains=search)

        return success_response(
            correlation_id=correlation_id,
            data={"tasks": [task_to_representation(task) for task in queryset]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = TaskWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save()
        _sync_task_placement_by_status(task)
        actor_name = get_user_display_name(request.user)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.created",
            summary=f"{actor_name} criou a tarefa com status={task.status}.",
        )
        task = Task.objects.filter(pk=task.pk).annotate(subtasks_count=Count("subtasks")).get()
        return success_response(
            correlation_id=correlation_id,
            data={"task": task_to_representation(task)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, task_id: UUID):
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
        task = Task.objects.filter(pk=task.pk).annotate(subtasks_count=Count("subtasks")).get()
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})

    def patch(self, request: Request, task_id: UUID):
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
        serializer = TaskWriteSerializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before_status = task.status
        before_priority = task.priority
        before_description = task.description or ""
        changed_fields = sorted(serializer.validated_data.keys())
        with transaction.atomic():
            serializer.save()
            task = Task.objects.filter(pk=task_id).annotate(subtasks_count=Count("subtasks")).get()
            group_moved = "group_id" in serializer.validated_data
            if group_moved and "status" not in serializer.validated_data:
                if apply_status_from_group(task):
                    extra = ["status", "updated_at"]
                    if status_bucket_for_task(task) == "done":
                        _close_open_time_logs_for_task(task)
                        if task.end_date is None:
                            task.end_date = timezone.now()
                            extra.append("end_date")
                    task.save(update_fields=extra)
            if ("status" in serializer.validated_data and task.status != before_status) or group_moved:
                if status_bucket_for_task(task) == "done":
                    _close_open_time_logs_for_task(task)
                    if task.end_date is None:
                        task.end_date = timezone.now()
                        task.save(update_fields=["end_date", "updated_at"])
                _sync_task_placement_by_status(task)
                task = Task.objects.filter(pk=task_id).annotate(subtasks_count=Count("subtasks")).get()
                if status_bucket_for_task(task) == "done" and status_bucket(before_status) != "done":
                    spawned = _spawn_next_recurrence(task)
                    if spawned is not None:
                        pass
        if "priority" in serializer.validated_data and task.priority != before_priority:
            dispatch_task_priority_changed(
                task=task,
                actor=request.user,
                old_priority=before_priority,
                new_priority=task.priority,
                correlation_id=correlation_id,
            )
        if task.status != before_status:
            dispatch_task_status_changed(
                task=task,
                actor=request.user,
                old_status=before_status,
                new_status=task.status,
                correlation_id=correlation_id,
            )
        other_fields = [field for field in changed_fields if field not in {"priority", "status"}]
        if other_fields:
            dispatch_task_updated(
                task=task,
                actor=request.user,
                fields=other_fields,
                correlation_id=correlation_id,
            )
        if "description" in serializer.validated_data:
            dispatch_task_mentions(
                task=task,
                actor=request.user,
                content=task.description or "",
                previous_content=before_description,
                correlation_id=correlation_id,
            )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.updated",
            summary=_humanize_changed_fields(changed_fields),
        )
        _recalculate_dependents(task)
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})

    def delete(self, request: Request, task_id: UUID):
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
        if TimeLog.objects.filter(task=task, status=TimeLog.Status.ACTIVE).exists():
            return error_response(
                correlation_id=correlation_id,
                code="task_time_active",
                message="Pare ou pause o cronometro desta tarefa antes de excluir.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        task_pk = str(task.pk)
        logger.info(
            "ops.task.deleted actor_id=%s correlation_id=%s task_id=%s",
            _actor_id(request),
            correlation_id,
            task_pk,
        )
        task.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True, "task_id": task_pk})


class TaskAssigneeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, task_id: UUID):
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
        serializer = TaskAssigneeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task.assignee_id = serializer.validated_data["assignee_id"]
        task.save(update_fields=["assignee_id", "updated_at"])
        task = Task.objects.select_related("assignee").get(pk=task.pk)
        dispatch_task_assigned_notification.delay(
            task_id=str(task.pk),
            assignee_id=task.assignee_id,
            actor_id=request.user.pk,
            correlation_id=correlation_id,
        )
        assignee_label = (
            str(getattr(task.assignee, "name", None) or getattr(task.assignee, "email", None) or task.assignee_id)
            if task.assignee_id
            else "sem responsavel"
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.assignee_changed",
            summary=f"Responsavel atualizado para {assignee_label}.",
        )
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})


class MyTasksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        # Minhas tarefas (raiz + subtarefas) e pais das minhas subtarefas (para aninhar na UI).
        my_assigned = Task.objects.filter(assignee=request.user)
        root_ids = my_assigned.filter(parent__isnull=True).values_list("pk", flat=True)
        sub_ids = my_assigned.filter(parent__isnull=False).values_list("pk", flat=True)
        parent_ids_from_subs = my_assigned.filter(parent__isnull=False).values_list("parent_id", flat=True)
        qs = (
            Task.objects.filter(Q(pk__in=root_ids) | Q(pk__in=sub_ids) | Q(pk__in=parent_ids_from_subs))
            .select_related("assignee", "group", "board")
            .annotate(subtasks_count=Count("subtasks"))
            .distinct()
            .order_by("-updated_at")
        )
        status_filter = request.query_params.get("status")
        priority_filter = request.query_params.get("priority")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if priority_filter:
            qs = qs.filter(priority=priority_filter)
        return success_response(
            correlation_id=correlation_id,
            data={"tasks": [task_to_representation(t) for t in qs]},
            meta={"total": qs.count()},
        )


class TaskDependenciesView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        serializer = TaskDependencyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dep_id = serializer.validated_data["depends_on_task_id"]
        try:
            depends_on = Task.objects.get(pk=dep_id)
        except Task.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="dependency_not_found",
                message="Tarefa predecessora nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if task.pk == depends_on.pk:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dependencia circular nao permitida.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if TaskDependency.objects.filter(task=depends_on, depends_on=task).exists():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dependencia circular nao permitida.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        dep, created = TaskDependency.objects.get_or_create(task=task, depends_on=depends_on)
        _recalculate_dependents(depends_on)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.dependency_added",
            summary=f"Dependencia adicionada para task={depends_on.pk}.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"dependency": {"id": str(dep.pk), "task_id": str(task.pk), "depends_on_task_id": str(depends_on.pk)}},
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class TaskStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, task_id: UUID):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
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
        if not is_admin and task.assignee_id != request.user.id:
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Voce so pode alterar status das tarefas atribuidas a voce.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        new_status = request.data.get("status")
        try:
            new_status = validate_active_task_status(new_status)
        except serializers.ValidationError:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Status invalido para tarefa.",
                details={"status": ["Use um status ativo do catalogo."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if TaskDependency.objects.filter(task=task, depends_on__status=Task.Status.BLOCKED).exists() and new_status == Task.Status.DONE:
            return error_response(
                correlation_id=correlation_id,
                code="task_blocked",
                message="Tarefa bloqueada por dependencia pendente.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        before = task.status
        update_fields = ["status", "updated_at"]
        spawned = None
        with transaction.atomic():
            if status_bucket(new_status) == "done":
                _close_open_time_logs_for_task(task)
                if task.end_date is None:
                    task.end_date = timezone.now()
                    update_fields.append("end_date")
            task.status = new_status
            task.save(update_fields=update_fields)
            _sync_task_placement_by_status(task)
            task.refresh_from_db()
            if status_bucket(new_status) == "done" and status_bucket(before) != "done":
                spawned = _spawn_next_recurrence(task)
        dispatch_task_status_changed(
            task=task,
            actor=request.user,
            old_status=before,
            new_status=new_status,
            correlation_id=correlation_id,
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.status_changed",
            summary=(
                f"Status alterado de {_status_label_pt(before)} para {_status_label_pt(new_status)}."
            ),
        )
        _recalculate_dependents(task)
        payload = {"task": task_to_representation(task)}
        if spawned is not None:
            payload["next_occurrence"] = task_to_representation(spawned)
        return success_response(correlation_id=correlation_id, data=payload)


class TaskTimeStartView(APIView):
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

        if TimeLog.objects.filter(task=task, user=request.user, status=TimeLog.Status.ACTIVE).exists():
            return error_response(
                correlation_id=correlation_id,
                code="time_log_already_active",
                message="Ja existe sessao ativa para esta tarefa e usuario.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        from django.conf import settings as django_settings
        from zoneinfo import ZoneInfo

        if bool(getattr(django_settings, "TIME_PLAY_CUTOFF_ENABLED", True)):
            cutoff_hour = int(getattr(django_settings, "TIME_PLAY_CUTOFF_HOUR", 18) or 18)
            local_now = timezone.now().astimezone(ZoneInfo("America/Sao_Paulo"))
            if local_now.hour >= cutoff_hour:
                return error_response(
                    correlation_id=correlation_id,
                    code="time_play_cutoff",
                    message=f"Play bloqueado apos {cutoff_hour:02d}:00 (America/Sao_Paulo).",
                    details={"cutoff_hour": cutoff_hour},
                    http_status=status.HTTP_409_CONFLICT,
                )

        now = timezone.now()
        actor_name = get_user_display_name(request.user)
        # Iniciar sempre abre sessao NOVA. Se houver pausada, encerra e comeca outra
        # (Retomar continua a mesma sessao — ou divide por dia se for outro dia).
        paused_logs = list(
            TimeLog.objects.filter(task=task, user=request.user, status=TimeLog.Status.PAUSED),
        )
        for paused_log in paused_logs:
            paused_log.current_started_at = None
            paused_log.ended_at = now
            paused_log.status = TimeLog.Status.COMPLETED
            paused_log.save(
                update_fields=["current_started_at", "ended_at", "status", "updated_at"],
            )

        time_log = TimeLog.objects.create(
            task=task,
            user=request.user,
            status=TimeLog.Status.ACTIVE,
            started_at=now,
            current_started_at=now,
            is_manual=False,
            source="timer",
        )
        _complete_other_open_time_logs(task=task, user=request.user, keep_id=time_log.pk, now=now)
        summary = (
            f"{actor_name} iniciou o cronometro (nova sessao; sessao pausada encerrada)."
            if paused_logs
            else f"{actor_name} iniciou o cronometro."
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.started",
            summary=summary,
        )
        log_audit_event(
            event_type="time.started",
            action="start",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={
                "task_id": str(task.pk),
                "status": time_log.status,
                "closed_paused_count": len(paused_logs),
            },
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(time_log)},
        )


class TaskTimePauseView(APIView):
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
        time_log = _resolve_time_log_for_user(
            task=task,
            user=request.user,
            status_value=TimeLog.Status.ACTIVE,
            allow_staff_fallback=True,
        )
        if time_log is None:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_active",
                message="Nao ha sessao ativa para pausar.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        elapsed = int((now - time_log.current_started_at).total_seconds()) if time_log.current_started_at else 0
        time_log.accumulated_seconds += max(elapsed, 0)
        time_log.current_started_at = None
        time_log.status = TimeLog.Status.PAUSED
        time_log.save(update_fields=["accumulated_seconds", "current_started_at", "status", "updated_at"])
        _complete_other_open_time_logs(task=task, user=time_log.user, keep_id=time_log.pk, now=now)
        actor_name = get_user_display_name(request.user)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.paused",
            summary=f"{actor_name} pausou o cronometro.",
        )
        log_audit_event(
            event_type="time.paused",
            action="pause",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={"task_id": str(task.pk), "status": time_log.status, "accumulated_seconds": time_log.accumulated_seconds},
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(time_log)},
        )


class TaskTimeResumeView(APIView):
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
        if TimeLog.objects.filter(task=task, user=request.user, status=TimeLog.Status.ACTIVE).exists():
            return error_response(
                correlation_id=correlation_id,
                code="time_log_already_active",
                message="Ja existe sessao ativa para esta tarefa e usuario.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        time_log = _resolve_time_log_for_user(
            task=task,
            user=request.user,
            status_value=TimeLog.Status.PAUSED,
            allow_staff_fallback=True,
        )
        if time_log is None:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_paused",
                message="Nao ha sessao pausada para retomar.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        active_log, split = _resume_paused_time_log(time_log=time_log, now=now)
        actor_name = get_user_display_name(request.user)
        summary = (
            f"{actor_name} iniciou nova sessao (sessao pausada de outro dia foi encerrada)."
            if split
            else f"{actor_name} retomou o cronometro."
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.started" if split else "task.time.resumed",
            summary=summary,
        )
        log_audit_event(
            event_type="time.started" if split else "time.resumed",
            action="start" if split else "resume",
            entity_type="time_log",
            entity_id=str(active_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={
                "task_id": str(task.pk),
                "status": active_log.status,
                "split_from_previous_day": split,
            },
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(active_log)},
        )


class TaskTimeManualView(APIView):
    """Registra apontamento manual concluido (is_manual=True, source=manual)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, task_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            task = Task.objects.select_related("board__project__portfolio__workspace").get(pk=task_id)
        except Task.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="task_not_found",
                message="Tarefa nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = TimeLogManualCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        started_at = serializer.validated_data["started_at"]
        ended_at = serializer.validated_data["ended_at"]
        accumulated_seconds = max(int((ended_at - started_at).total_seconds()), 0)

        time_log = TimeLog.objects.create(
            task=task,
            user=request.user,
            status=TimeLog.Status.COMPLETED,
            started_at=started_at,
            ended_at=ended_at,
            current_started_at=None,
            accumulated_seconds=accumulated_seconds,
            is_manual=True,
            source="manual",
        )
        actor_name = get_user_display_name(request.user)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.manual",
            summary=f"{actor_name} registrou tempo manual.",
        )
        log_audit_event(
            event_type="time.manual",
            action="create",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={
                "task_id": str(task.pk),
                "status": time_log.status,
                "is_manual": True,
                "source": "manual",
                "accumulated_seconds": accumulated_seconds,
            },
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(time_log)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskCompleteView(APIView):
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
        if TaskDependency.objects.filter(task=task, depends_on__status=Task.Status.BLOCKED).exists():
            return error_response(
                correlation_id=correlation_id,
                code="task_blocked",
                message="Tarefa bloqueada por dependencia pendente.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        time_log = _resolve_time_log_for_user(
            task=task,
            user=request.user,
            status_value=TimeLog.Status.ACTIVE,
            allow_staff_fallback=True,
        )

        now = timezone.now()
        spawned = None
        done_key = done_catalog_key()
        with transaction.atomic():
            _close_open_time_logs_for_task(task, now=now)
            task.status = done_key
            if task.end_date is None:
                task.end_date = now
            task.save(update_fields=["status", "end_date", "updated_at"])
            _sync_task_placement_by_status(task)
            task.refresh_from_db()
            spawned = _spawn_next_recurrence(task)
        if time_log is not None:
            time_log.refresh_from_db()

        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.completed",
            summary="Tarefa concluida.",
        )
        log_audit_event(
            event_type="time.completed",
            action="complete",
            entity_type="time_log" if time_log is not None else "task",
            entity_id=str(time_log.pk) if time_log is not None else str(task.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            before={"task_status": Task.Status.IN_PROGRESS},
            after={
                "task_id": str(task.pk),
                "task_status": task.status,
                "time_status": time_log.status if time_log is not None else None,
            },
        )
        dispatch_task_completed_notifications.delay(
            task_id=str(task.pk),
            actor_id=request.user.pk,
            correlation_id=correlation_id,
        )
        _recalculate_dependents(task)
        return success_response(
            correlation_id=correlation_id,
            data={
                "task": task_to_representation(task),
                "time_log": time_log_to_representation(time_log) if time_log is not None else None,
            },
        )


class TimeLogDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, time_log_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            time_log = TimeLog.objects.select_related("task").get(pk=time_log_id)
        except TimeLog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_found",
                message="Log de tempo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        if not is_admin and int(time_log.user_id) != int(request.user.pk):
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Voce so pode editar seus proprios registros de tempo.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        if time_log.status == TimeLog.Status.DELETED:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Registro ja removido.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TimeLogUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        started_at = serializer.validated_data.get("started_at", time_log.started_at)
        ended_at = serializer.validated_data.get("ended_at", time_log.ended_at)
        if ended_at and ended_at <= started_at:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Intervalo de tempo invalido.",
                details={"ended_at": ["Data final deve ser maior que a inicial."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        time_log.started_at = started_at
        time_log.ended_at = ended_at
        # Edicao manual marca como is_manual (aparece em vermelho na UI, igual sessao manual).
        time_log.is_manual = True
        if getattr(time_log, "source", None) != "manual":
            time_log.source = "edited"
        if ended_at:
            time_log.status = TimeLog.Status.COMPLETED
            time_log.current_started_at = None
            time_log.accumulated_seconds = max(int((ended_at - started_at).total_seconds()), 0)
        time_log.save(
            update_fields=[
                "started_at",
                "ended_at",
                "status",
                "current_started_at",
                "accumulated_seconds",
                "is_manual",
                "source",
                "updated_at",
            ],
        )
        _log_task_activity(
            task=time_log.task,
            actor_id=request.user.pk,
            event_type="task.time.edited",
            summary=f"{get_user_display_name(request.user)} atualizou o registro de tempo.",
        )
        return success_response(correlation_id=correlation_id, data={"time_log": time_log_to_representation(time_log)})

    def delete(self, request: Request, time_log_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            time_log = TimeLog.objects.select_related("task").get(pk=time_log_id)
        except TimeLog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_found",
                message="Log de tempo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        if not is_admin and int(time_log.user_id) != int(request.user.pk):
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Voce so pode remover seus proprios registros de tempo.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        task = time_log.task
        time_log.status = TimeLog.Status.DELETED
        time_log.current_started_at = None
        time_log.save(update_fields=["status", "current_started_at", "updated_at"])
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.deleted",
            summary=f"{get_user_display_name(request.user)} removeu o registro de tempo.",
        )
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class TaskTimeSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, task_id: UUID):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
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
        logs = TimeLog.objects.filter(task=task).exclude(status=TimeLog.Status.DELETED).select_related("user")
        if not is_admin:
            logs = logs.filter(user=request.user)
        logs = logs.order_by("-created_at")
        total_seconds = 0
        for log in logs:
            total_seconds += time_log_to_representation(log)["total_seconds"]
        return success_response(
            correlation_id=correlation_id,
            data={
                "task_id": str(task.pk),
                "total_seconds": total_seconds,
                "logs": [time_log_to_representation(log) for log in logs],
            },
            meta={"total": logs.count()},
        )


class TaskTimeSummariesBatchView(APIView):
    """Resumo de tempo para varias tarefas em uma unica request (lista/tabelas)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        raw_ids = request.data.get("task_ids") if isinstance(request.data, dict) else None
        if not isinstance(raw_ids, list):
            return error_response(
                correlation_id=correlation_id,
                code="invalid_payload",
                message="Informe task_ids (lista).",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        task_ids: list[UUID] = []
        seen: set[str] = set()
        for item in raw_ids[:80]:
            try:
                uid = UUID(str(item))
            except (TypeError, ValueError):
                continue
            key = str(uid)
            if key in seen:
                continue
            seen.add(key)
            task_ids.append(uid)
        if not task_ids:
            return success_response(
                correlation_id=correlation_id,
                data={"summaries": {}},
                meta={"total": 0},
            )
        logs_qs = (
            TimeLog.objects.filter(task_id__in=task_ids)
            .exclude(status=TimeLog.Status.DELETED)
            .select_related("user")
            .order_by("-created_at")
        )
        if not is_admin:
            logs_qs = logs_qs.filter(user=request.user)
        summaries: dict[str, dict] = {str(tid): {"task_id": str(tid), "total_seconds": 0, "logs": []} for tid in task_ids}
        for log in logs_qs:
            key = str(log.task_id)
            row = summaries.get(key)
            if row is None:
                continue
            payload = time_log_to_representation(log)
            row["logs"].append(payload)
            row["total_seconds"] += int(payload.get("total_seconds") or 0)
        return success_response(
            correlation_id=correlation_id,
            data={"summaries": summaries},
            meta={"total": len(summaries)},
        )


class TimeLogsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        qs = TimeLog.objects.select_related("task__board__project__portfolio__workspace", "user").exclude(
            status=TimeLog.Status.DELETED,
        )
        workspace_id = request.query_params.get("workspace_id")
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        page = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)

        if workspace_id:
            qs = qs.filter(task__board__project__portfolio__workspace_id=workspace_id)
        if from_date:
            qs = qs.filter(started_at__date__gte=from_date)
        if to_date:
            qs = qs.filter(started_at__date__lte=to_date)
        if not is_admin:
            qs = qs.filter(user=request.user)

        total = qs.count()
        start = (page - 1) * page_size
        logs = qs.order_by("-started_at")[start : start + page_size]
        pages = max((total + page_size - 1) // page_size, 1)

        return success_response(
            correlation_id=correlation_id,
            data={"time_logs": [time_log_to_representation(log) for log in logs]},
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
            },
        )


class NotificationsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        page = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)
        qs = Notification.objects.filter(user=request.user).order_by("-created_at")
        total = qs.count()
        start = (page - 1) * page_size
        notifications = qs[start : start + page_size]
        pages = max((total + page_size - 1) // page_size, 1)
        return success_response(
            correlation_id=correlation_id,
            data={"notifications": [notification_to_representation(item) for item in notifications]},
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
            },
        )


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, notification_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            notification = Notification.objects.get(pk=notification_id, user=request.user)
        except Notification.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="notification_not_found",
                message="Notificacao nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"notification": notification_to_representation(notification)},
        )


class NotificationsUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        return success_response(
            correlation_id=correlation_id,
            data={"unread_count": unread_count},
        )


class NotificationsDeadlineScanView(APIView):
    permission_classes = [IsAuthenticated, IsSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        dispatch_deadline_notifications.delay(correlation_id=correlation_id)
        return success_response(
            correlation_id=correlation_id,
            data={"queued": True},
        )


class TaskCommentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, task_id: UUID):
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
        comments = (
            TaskComment.objects.filter(task=task)
            .select_related("author")
            .prefetch_related("attachments")
            .order_by("created_at")
        )
        return success_response(
            correlation_id=correlation_id,
            data={"comments": [task_comment_to_representation(item, request=request) for item in comments]},
            meta={"total": comments.count()},
        )

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
        serializer = TaskCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = TaskComment.objects.create(task=task, author=request.user, **serializer.validated_data)
        dispatch_task_comment(
            task=Task.objects.select_related("board__project__portfolio__workspace").get(pk=task.pk),
            actor=request.user,
            content=comment.content,
            correlation_id=correlation_id,
        )
        snippet = _comment_activity_snippet(comment.content)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.comment_added",
            summary=f"Comentario adicionado: {snippet}" if snippet else "Comentario adicionado.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"comment": task_comment_to_representation(comment, request=request)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskCommentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, task_id: UUID, comment_id: UUID):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        try:
            comment = TaskComment.objects.select_related("task", "author").prefetch_related("attachments").get(
                pk=comment_id,
                task_id=task_id,
            )
        except TaskComment.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="comment_not_found",
                message="Comentario nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if not is_admin and comment.author_id != request.user.id:
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Voce so pode editar comentarios criados por voce.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TaskCommentUpdateSerializer(comment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        previous_content = comment.content or ""
        serializer.save()
        comment.refresh_from_db()
        if "content" in serializer.validated_data:
            dispatch_task_mentions(
                task=comment.task,
                actor=request.user,
                content=comment.content or "",
                previous_content=previous_content,
                correlation_id=correlation_id,
            )
        snippet = _comment_activity_snippet(comment.content)
        _log_task_activity(
            task=comment.task,
            actor_id=request.user.pk,
            event_type="task.comment_edited",
            summary=f"Comentario editado: {snippet}" if snippet else "Comentario editado.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"comment": task_comment_to_representation(comment, request=request)},
        )

    def delete(self, request: Request, task_id: UUID, comment_id: UUID):
        correlation_id = get_correlation_id(request)
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        try:
            comment = TaskComment.objects.select_related("task").get(pk=comment_id, task_id=task_id)
        except TaskComment.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="comment_not_found",
                message="Comentario nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if not is_admin and comment.author_id != request.user.id:
            return error_response(
                correlation_id=correlation_id,
                code="forbidden",
                message="Voce so pode excluir comentarios criados por voce.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        task = comment.task
        comment.delete()
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.comment_deleted",
            summary=f"Comentario {comment_id} removido.",
        )
        return success_response(correlation_id=correlation_id, data={"deleted": True, "comment_id": str(comment_id)})


class TaskAttachmentsView(APIView):
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

        uploaded = request.FILES.get("file")
        comment = None
        comment_id_raw = request.data.get("comment_id")
        if comment_id_raw:
            try:
                comment = TaskComment.objects.get(pk=comment_id_raw, task_id=task.pk)
            except (TaskComment.DoesNotExist, ValueError, TypeError):
                return error_response(
                    correlation_id=correlation_id,
                    code="comment_not_found",
                    message="Comentario nao encontrado para esta tarefa.",
                    details={},
                    http_status=status.HTTP_404_NOT_FOUND,
                )

        if uploaded is not None:
            size_bytes = int(getattr(uploaded, "size", 0) or 0)
            if size_bytes > MAX_ATTACHMENT_BYTES:
                return error_response(
                    correlation_id=correlation_id,
                    code="file_too_large",
                    message="Arquivo excede limite de 20MB.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            content_type = (getattr(uploaded, "content_type", None) or request.data.get("content_type") or "").strip()
            filename = (getattr(uploaded, "name", None) or request.data.get("filename") or "arquivo").strip()
            serializer = TaskAttachmentCreateSerializer(
                data={
                    "filename": filename[:255],
                    "content_type": content_type,
                    "size_bytes": size_bytes,
                    "comment_id": comment.pk if comment else None,
                },
            )
            serializer.is_valid(raise_exception=True)
            attachment = TaskAttachment(
                task=task,
                author=request.user,
                comment=comment,
                filename=serializer.validated_data["filename"],
                content_type=serializer.validated_data.get("content_type") or "",
                size_bytes=serializer.validated_data["size_bytes"],
            )
            attachment.file = uploaded
            attachment.save()
        else:
            serializer = TaskAttachmentCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            validated = serializer.validated_data
            comment_id = validated.pop("comment_id", None)
            if comment_id and comment is None:
                try:
                    comment = TaskComment.objects.get(pk=comment_id, task_id=task.pk)
                except TaskComment.DoesNotExist:
                    return error_response(
                        correlation_id=correlation_id,
                        code="comment_not_found",
                        message="Comentario nao encontrado para esta tarefa.",
                        details={},
                        http_status=status.HTTP_404_NOT_FOUND,
                    )
            attachment = TaskAttachment.objects.create(
                task=task,
                author=request.user,
                comment=comment,
                **validated,
            )

        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.attachment_added",
            summary=f"Anexo {attachment.filename} adicionado.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"attachment": task_attachment_to_representation(attachment, request=request)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskActivityView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, task_id: UUID):
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
        activities = TaskActivity.objects.filter(task=task).order_by("-created_at")
        return success_response(
            correlation_id=correlation_id,
            data={
                "activities": [
                    {
                        "id": str(a.pk),
                        "task_id": str(task.pk),
                        "actor_id": a.actor_id,
                        "event_type": a.event_type,
                        "summary": a.summary,
                        "created_at": a.created_at.isoformat().replace("+00:00", "Z"),
                    }
                    for a in activities
                ],
            },
            meta={"total": activities.count()},
        )


class BoardProgressView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, board_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="board_not_found",
                message="Board nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        qs = Task.objects.filter(board=board)
        total = qs.count()
        by_status = {
            Task.Status.TODO: qs.filter(status=Task.Status.TODO).count(),
            Task.Status.IN_PROGRESS: qs.filter(status=Task.Status.IN_PROGRESS).count(),
            Task.Status.BLOCKED: qs.filter(status=Task.Status.BLOCKED).count(),
            Task.Status.DONE: qs.filter(status=Task.Status.DONE).count(),
        }
        progress_percent = 0 if total == 0 else int((by_status[Task.Status.DONE] * 100) / total)
        return success_response(
            correlation_id=correlation_id,
            data={
                "board_id": str(board.pk),
                "progress_percent": progress_percent,
                "counts": by_status,
            },
        )
