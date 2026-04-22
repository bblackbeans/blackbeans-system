from __future__ import annotations

import logging
from datetime import timedelta
from uuid import UUID

from django.utils import timezone
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.operations_serializers import PortfolioWriteSerializer
from blackbeans_api.api.operations_serializers import ProjectWriteSerializer
from blackbeans_api.api.operations_serializers import WorkspaceWriteSerializer
from blackbeans_api.api.operations_serializers import BoardWriteSerializer
from blackbeans_api.api.operations_serializers import board_to_representation
from blackbeans_api.api.operations_serializers import BoardGroupCreateSerializer
from blackbeans_api.api.operations_serializers import BoardGroupUpdateSerializer
from blackbeans_api.api.operations_serializers import board_group_to_representation
from blackbeans_api.api.operations_serializers import TaskWriteSerializer
from blackbeans_api.api.operations_serializers import TaskAssigneeSerializer
from blackbeans_api.api.operations_serializers import TaskAttachmentCreateSerializer
from blackbeans_api.api.operations_serializers import TaskCommentCreateSerializer
from blackbeans_api.api.operations_serializers import TaskDependencyCreateSerializer
from blackbeans_api.api.operations_serializers import notification_to_representation
from blackbeans_api.api.operations_serializers import task_to_representation
from blackbeans_api.api.operations_serializers import TimeLogUpdateSerializer
from blackbeans_api.api.operations_serializers import time_log_to_representation
from blackbeans_api.api.operations_serializers import portfolio_to_representation
from blackbeans_api.api.operations_serializers import project_to_representation
from blackbeans_api.api.operations_serializers import workspace_to_representation
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


def _recalculate_dependents(task: Task) -> None:
    if task.end_date is None:
        return
    deps = TaskDependency.objects.select_related("task").filter(depends_on=task)
    for dep in deps:
        dependent = dep.task
        if dependent.start_date is None or dependent.start_date < task.end_date:
            duration = None
            if dependent.start_date and dependent.end_date and dependent.end_date >= dependent.start_date:
                duration = dependent.end_date - dependent.start_date
            dependent.start_date = task.end_date
            if duration is not None:
                dependent.end_date = dependent.start_date + duration
            dependent.save(update_fields=["start_date", "end_date", "updated_at"])


class WorkspaceListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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


class BoardDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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

        tasks = Task.objects.filter(board=board).select_related("group", "assignee").order_by("group__position", "created_at")
        if view == "list":
            payload = {"view": "list", "tasks": [task_to_representation(t) for t in tasks]}
        elif view == "kanban":
            groups = BoardGroup.objects.filter(board=board).order_by("position")
            payload_groups = []
            for g in groups:
                payload_groups.append(
                    {
                        "group": board_group_to_representation(g),
                        "tasks": [task_to_representation(t) for t in tasks if t.group_id == g.pk],
                    },
                )
            payload = {"view": "kanban", "groups": payload_groups}
        else:
            payload = {"view": "timeline", "tasks": [task_to_representation(t) for t in tasks]}

        return success_response(correlation_id=correlation_id, data={"board": board_to_representation(board), **payload})


class TaskListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = Task.objects.select_related("group", "board").order_by("created_at")
        board_id = request.query_params.get("board_id")
        group_id = request.query_params.get("group_id")
        status_filter = request.query_params.get("status")
        search = (request.query_params.get("search") or "").strip()

        if board_id:
            queryset = queryset.filter(board_id=board_id)
        if group_id:
            queryset = queryset.filter(group_id=group_id)
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
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.created",
            summary=f"Tarefa criada com status={task.status}.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={"task": task_to_representation(task)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        serializer.save()
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.updated",
            summary=f"Tarefa atualizada campos={','.join(sorted(serializer.validated_data.keys()))}.",
        )
        _recalculate_dependents(task)
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})


class TaskAssigneeView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        dispatch_task_assigned_notification.delay(
            task_id=str(task.pk),
            assignee_id=task.assignee_id,
            actor_id=request.user.pk,
            correlation_id=correlation_id,
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.assignee_changed",
            summary=f"Responsavel atualizado para user_id={task.assignee_id}.",
        )
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})


class MyTasksView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        qs = Task.objects.filter(assignee=request.user).order_by("-updated_at")
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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        new_status = request.data.get("status")
        if new_status not in dict(Task.Status.choices):
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Status invalido para tarefa.",
                details={"status": ["Use um status valido."]},
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
        task.status = new_status
        task.save(update_fields=["status", "updated_at"])
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.status_changed",
            summary=f"Status alterado de {before} para {new_status}.",
        )
        _recalculate_dependents(task)
        return success_response(correlation_id=correlation_id, data={"task": task_to_representation(task)})


class TaskTimeStartView(APIView):
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

        if TimeLog.objects.filter(task=task, user=request.user, status=TimeLog.Status.ACTIVE).exists():
            return error_response(
                correlation_id=correlation_id,
                code="time_log_already_active",
                message="Ja existe sessao ativa para esta tarefa e usuario.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        time_log = TimeLog.objects.create(
            task=task,
            user=request.user,
            status=TimeLog.Status.ACTIVE,
            started_at=now,
            current_started_at=now,
        )
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.started",
            summary=f"Cronometro iniciado em log={time_log.pk}.",
        )
        log_audit_event(
            event_type="time.started",
            action="start",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={"task_id": str(task.pk), "status": time_log.status},
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(time_log)},
        )


class TaskTimePauseView(APIView):
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
        try:
            time_log = TimeLog.objects.get(task=task, user=request.user, status=TimeLog.Status.ACTIVE)
        except TimeLog.DoesNotExist:
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
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.paused",
            summary=f"Cronometro pausado no log={time_log.pk}.",
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
        try:
            time_log = TimeLog.objects.get(task=task, user=request.user, status=TimeLog.Status.PAUSED)
        except TimeLog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_paused",
                message="Nao ha sessao pausada para retomar.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        time_log.current_started_at = now
        time_log.status = TimeLog.Status.ACTIVE
        time_log.save(update_fields=["current_started_at", "status", "updated_at"])
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.resumed",
            summary=f"Cronometro retomado no log={time_log.pk}.",
        )
        log_audit_event(
            event_type="time.resumed",
            action="resume",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            after={"task_id": str(task.pk), "status": time_log.status},
        )
        return success_response(
            correlation_id=correlation_id,
            data={"time_log": time_log_to_representation(time_log)},
        )


class TaskCompleteView(APIView):
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
        if TaskDependency.objects.filter(task=task, depends_on__status=Task.Status.BLOCKED).exists():
            return error_response(
                correlation_id=correlation_id,
                code="task_blocked",
                message="Tarefa bloqueada por dependencia pendente.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        try:
            time_log = TimeLog.objects.get(task=task, user=request.user, status=TimeLog.Status.ACTIVE)
        except TimeLog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="time_log_not_active",
                message="Nao ha sessao ativa para encerrar.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        elapsed = int((now - time_log.current_started_at).total_seconds()) if time_log.current_started_at else 0
        with transaction.atomic():
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
            task.status = Task.Status.DONE
            task.end_date = now
            task.save(update_fields=["status", "end_date", "updated_at"])

        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.completed",
            summary=f"Tarefa concluida com apontamento encerrado em log={time_log.pk}.",
        )
        log_audit_event(
            event_type="time.completed",
            action="complete",
            entity_type="time_log",
            entity_id=str(time_log.pk),
            actor_id=request.user.pk,
            workspace_id=str(task.board.project.portfolio.workspace_id),
            correlation_id=correlation_id,
            before={"task_status": Task.Status.IN_PROGRESS},
            after={"task_id": str(task.pk), "task_status": task.status, "time_status": time_log.status},
        )
        dispatch_task_completed_notifications.delay(
            task_id=str(task.pk),
            actor_id=request.user.pk,
            correlation_id=correlation_id,
        )
        _recalculate_dependents(task)
        return success_response(
            correlation_id=correlation_id,
            data={"task": task_to_representation(task), "time_log": time_log_to_representation(time_log)},
        )


class TimeLogDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        if ended_at:
            time_log.status = TimeLog.Status.COMPLETED
            time_log.current_started_at = None
            time_log.accumulated_seconds = int((ended_at - started_at).total_seconds())
        time_log.save(
            update_fields=[
                "started_at",
                "ended_at",
                "status",
                "current_started_at",
                "accumulated_seconds",
                "updated_at",
            ],
        )
        _log_task_activity(
            task=time_log.task,
            actor_id=request.user.pk,
            event_type="task.time.edited",
            summary=f"Log de tempo atualizado log={time_log.pk}.",
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
        task = time_log.task
        time_log.status = TimeLog.Status.DELETED
        time_log.current_started_at = None
        time_log.save(update_fields=["status", "current_started_at", "updated_at"])
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.time.deleted",
            summary=f"Log de tempo removido log={time_log.pk}.",
        )
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class TaskTimeSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        logs = TimeLog.objects.filter(task=task).exclude(status=TimeLog.Status.DELETED).order_by("-created_at")
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


class TimeLogsListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
        serializer = TaskCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = TaskComment.objects.create(task=task, author=request.user, **serializer.validated_data)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.comment_added",
            summary="Comentario adicionado.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "comment": {
                    "id": str(comment.pk),
                    "task_id": str(task.pk),
                    "author_id": comment.author_id,
                    "content": comment.content,
                    "created_at": comment.created_at.isoformat().replace("+00:00", "Z"),
                },
            },
            http_status=status.HTTP_201_CREATED,
        )


class TaskAttachmentsView(APIView):
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
        serializer = TaskAttachmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attachment = TaskAttachment.objects.create(task=task, author=request.user, **serializer.validated_data)
        _log_task_activity(
            task=task,
            actor_id=request.user.pk,
            event_type="task.attachment_added",
            summary=f"Anexo {attachment.filename} adicionado.",
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "attachment": {
                    "id": str(attachment.pk),
                    "task_id": str(task.pk),
                    "author_id": attachment.author_id,
                    "filename": attachment.filename,
                    "content_type": attachment.content_type,
                    "size_bytes": attachment.size_bytes,
                    "created_at": attachment.created_at.isoformat().replace("+00:00", "Z"),
                },
            },
            http_status=status.HTTP_201_CREATED,
        )


class TaskActivityView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

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
