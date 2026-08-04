from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.operations_serializers import task_to_representation
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import ClientRequest
from blackbeans_api.governance.models import ContractServiceLine
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TimeLog


def client_request_to_representation(item: ClientRequest) -> dict:
    return {
        "id": str(item.pk),
        "client_name": item.client_name,
        "contact_name": item.contact_name,
        "contact_email": item.contact_email,
        "contact_phone": item.contact_phone,
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "converted_task_id": str(item.converted_task_id) if item.converted_task_id else None,
        "converted_project_id": str(item.converted_project_id) if item.converted_project_id else None,
        "created_at": item.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": item.updated_at.isoformat().replace("+00:00", "Z"),
    }


class ClientRequestPublicCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        title = str(request.data.get("title") or "").strip()
        client_name = str(request.data.get("client_name") or "").strip()
        if not title or not client_name:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe client_name e title.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        item = ClientRequest.objects.create(
            client_name=client_name,
            contact_name=str(request.data.get("contact_name") or "").strip(),
            contact_email=str(request.data.get("contact_email") or "").strip(),
            contact_phone=str(request.data.get("contact_phone") or "").strip(),
            title=title,
            description=str(request.data.get("description") or "").strip(),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"request": client_request_to_representation(item)},
            http_status=status.HTTP_201_CREATED,
        )


class ClientRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        qs = ClientRequest.objects.all().order_by("-created_at")
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        rows = list(qs[:200])
        return success_response(
            correlation_id=correlation_id,
            data={"requests": [client_request_to_representation(row) for row in rows]},
            meta={"total": len(rows)},
        )


class ClientRequestConvertView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, request_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            item = ClientRequest.objects.get(pk=request_id)
        except ClientRequest.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Pedido nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        project_id = request.data.get("project_id")
        board_id = request.data.get("board_id")
        group_id = request.data.get("group_id")
        try:
            if group_id:
                group = BoardGroup.objects.select_related("board__project").get(pk=group_id)
            elif board_id:
                board = Board.objects.select_related("project").get(pk=board_id)
                group = board.groups.order_by("position").first()
                if group is None:
                    raise BoardGroup.DoesNotExist
            elif project_id:
                project = Project.objects.get(pk=project_id)
                board = project.boards.order_by("created_at").first()
                if board is None:
                    board = Board.objects.create(project=project, name="Board")
                group = board.groups.order_by("position").first()
                if group is None:
                    group = BoardGroup.objects.create(board=board, name="A fazer", position=1, wip_limit=20)
            else:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Informe project_id, board_id ou group_id.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
        except (Project.DoesNotExist, Board.DoesNotExist, BoardGroup.DoesNotExist):
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Projeto/quadro/grupo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            title = str(request.data.get("title") or item.title or "").strip() or item.title
            description = str(request.data.get("description") or "").strip()
            if not description:
                contact_bits = " ".join(
                    part
                    for part in [item.contact_name, item.contact_email, item.contact_phone]
                    if part
                ).strip()
                description = (
                    f"{item.description}\n\n"
                    f"Pedido cliente: {item.client_name}\n"
                    f"Solicitante: {contact_bits or '-'}"
                ).strip()

            priority = str(request.data.get("priority") or Task.Priority.MEDIUM).strip()
            if priority not in {choice.value for choice in Task.Priority}:
                priority = Task.Priority.MEDIUM
            task_status = str(request.data.get("status") or Task.Status.TODO).strip() or Task.Status.TODO
            assignee_raw = request.data.get("assignee_id")
            assignee_id = None
            if assignee_raw not in (None, ""):
                try:
                    assignee_id = int(assignee_raw)
                except (TypeError, ValueError):
                    assignee_id = None
            effort_raw = request.data.get("effort_points")
            try:
                effort_points = max(int(float(effort_raw)), 0) if effort_raw not in (None, "") else 1
            except (TypeError, ValueError):
                effort_points = 1

            start_raw = request.data.get("start_date")
            end_raw = request.data.get("end_date")
            start_date = parse_datetime(str(start_raw)) if start_raw else None
            end_date = parse_datetime(str(end_raw)) if end_raw else None
            if start_raw and start_date is None and len(str(start_raw)) == 10:
                start_date = parse_datetime(f"{start_raw}T12:00:00")
            if end_raw and end_date is None and len(str(end_raw)) == 10:
                end_date = parse_datetime(f"{end_raw}T12:00:00")
            if start_date and timezone.is_naive(start_date):
                start_date = timezone.make_aware(start_date, timezone.get_current_timezone())
            if end_date and timezone.is_naive(end_date):
                end_date = timezone.make_aware(end_date, timezone.get_current_timezone())

            client_id = request.data.get("client_id")
            project = group.board.project
            if client_id and str(project.client_id or "") != str(client_id):
                project.client_id = client_id
                project.save(update_fields=["client_id", "updated_at"])

            task = Task.objects.create(
                board=group.board,
                group=group,
                title=title,
                description=description,
                status=task_status,
                priority=priority,
                assignee_id=assignee_id,
                effort_points=effort_points,
                start_date=start_date,
                end_date=end_date,
            )
            item.status = ClientRequest.Status.CONVERTED
            item.converted_task = task
            item.converted_project = group.board.project
            item.save(update_fields=["status", "converted_task", "converted_project", "updated_at"])

        return success_response(
            correlation_id=correlation_id,
            data={
                "request": client_request_to_representation(item),
                "task": task_to_representation(task),
            },
        )


class AdminHoursDashboardView(APIView):
    """Horas consumidas (TimeLog) vs contratadas (soma effort das linhas ou effort_points)."""

    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    @staticmethod
    def _parse_period_bounds(request: Request):
        """Retorna (start_dt, end_dt) inclusivo no fuso atual, ou (None, None)."""
        from datetime import datetime, time, timedelta

        from django.utils.dateparse import parse_date

        period = str(request.query_params.get("period") or "all").strip().lower()
        date_from_raw = str(request.query_params.get("date_from") or "").strip()
        date_to_raw = str(request.query_params.get("date_to") or "").strip()
        now = timezone.localtime(timezone.now())
        today = now.date()

        start_d = parse_date(date_from_raw) if date_from_raw else None
        end_d = parse_date(date_to_raw) if date_to_raw else None

        if period == "today":
            start_d, end_d = today, today
        elif period in {"this_week", "week_mon_fri"}:
            # Semana util: segunda a sexta (mesmo se hoje for fim de semana)
            monday = today - timedelta(days=today.weekday())
            friday = monday + timedelta(days=4)
            start_d, end_d = monday, friday
        elif period == "this_month":
            start_d = today.replace(day=1)
            # fim do mes corrente
            if today.month == 12:
                end_d = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end_d = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        elif period == "last_7":
            start_d = today - timedelta(days=6)
            end_d = today
        elif period == "last_30":
            start_d = today - timedelta(days=29)
            end_d = today
        elif period in {"all", "lifetime", "custom", ""}:
            # all/lifetime: sem bound (exceto custom com datas)
            if period != "custom":
                start_d, end_d = None, None
        else:
            # periodo desconhecido: ignora
            start_d, end_d = None, None

        if not start_d and not end_d:
            return None, None

        start_dt = (
            timezone.make_aware(datetime.combine(start_d, time.min))
            if start_d
            else None
        )
        end_dt = (
            timezone.make_aware(datetime.combine(end_d, time.max))
            if end_d
            else None
        )
        return start_dt, end_dt

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        project_id = request.query_params.get("project_id")
        client_id = request.query_params.get("client_id")
        user_id = request.query_params.get("user_id")
        start_dt, end_dt = self._parse_period_bounds(request)

        logs = TimeLog.objects.exclude(status=TimeLog.Status.DELETED).select_related(
            "user",
            "task",
            "task__board",
            "task__board__project",
            "task__board__project__client",
        )
        if project_id:
            logs = logs.filter(task__board__project_id=project_id)
        if client_id:
            logs = logs.filter(task__board__project__client_id=client_id)
        if user_id:
            logs = logs.filter(user_id=user_id)
        # Filtro de período: usa started_at (quando o apontamento começou)
        if start_dt:
            logs = logs.filter(started_at__gte=start_dt)
        if end_dt:
            logs = logs.filter(started_at__lte=end_dt)

        consumed = 0
        by_user_seconds: dict[int, int] = {}
        # user_id -> task_id -> aggregate
        by_user_tasks: dict[int, dict[str, dict]] = {}

        for log in logs:
            seconds = int(log.accumulated_seconds or 0)
            if log.status == TimeLog.Status.ACTIVE and log.current_started_at:
                seconds += max(int((timezone.now() - log.current_started_at).total_seconds()), 0)
            if seconds <= 0:
                continue
            consumed += seconds
            uid = int(log.user_id) if log.user_id else 0
            by_user_seconds[uid] = by_user_seconds.get(uid, 0) + seconds

            task = log.task
            task_key = str(task.pk) if task else "none"
            user_tasks = by_user_tasks.setdefault(uid, {})
            if task_key not in user_tasks:
                project = getattr(getattr(task, "board", None), "project", None) if task else None
                client = getattr(project, "client", None) if project else None
                user_tasks[task_key] = {
                    "task_id": task_key if task else None,
                    "task_title": (task.title if task else "Sem tarefa"),
                    "effort_points": int(getattr(task, "effort_points", 0) or 0) if task else 0,
                    "client_id": str(client.pk) if client else None,
                    "client_name": (getattr(client, "name", None) or "") if client else "",
                    "project_id": str(project.pk) if project else None,
                    "project_name": (getattr(project, "name", None) or "") if project else "",
                    "consumed_seconds": 0,
                }
            user_tasks[task_key]["consumed_seconds"] += seconds

        from django.contrib.auth import get_user_model
        from django.db.models import Q

        User = get_user_model()
        user_role = str(request.query_params.get("user_role") or "all").strip().lower()
        if user_role in {"collaborador", "colaboradores", "collaborators"}:
            user_role = "collaborator"
        elif user_role in {"admins", "staff"}:
            user_role = "admin"
        elif user_role not in {"all", "collaborator", "admin"}:
            user_role = "all"

        # Inclui todos os usuarios ativos (com ou sem horas) para listar colaborador e admin
        users_qs = User.objects.filter(is_active=True).only(
            "id", "name", "email", "username", "is_staff", "is_superuser"
        )
        if user_role == "admin":
            users_qs = users_qs.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif user_role == "collaborator":
            users_qs = users_qs.filter(is_staff=False, is_superuser=False)

        users = {u.pk: u for u in users_qs}
        # Se filtrou um user_id especifico, restringe a lista
        if user_id:
            try:
                uid_filter = int(user_id)
            except (TypeError, ValueError):
                uid_filter = None
            if uid_filter is not None:
                users = {uid: u for uid, u in users.items() if uid == uid_filter}

        # Tambem considera usuarios que apontaram horas mas nao vieram no qs (ex.: inativos)
        missing_ids = [uid for uid in by_user_seconds.keys() if uid and uid not in users]
        if missing_ids and user_role == "all" and not user_id:
            for u in User.objects.filter(pk__in=missing_ids).only(
                "id", "name", "email", "username", "is_staff", "is_superuser"
            ):
                users[u.pk] = u

        by_collaborator = []
        filtered_consumed = 0
        for uid, user in users.items():
            is_admin_user = bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))
            if user_role == "admin" and not is_admin_user:
                continue
            if user_role == "collaborator" and is_admin_user:
                continue
            seconds = int(by_user_seconds.get(uid, 0) or 0)
            filtered_consumed += seconds
            label = (
                (getattr(user, "name", None) or "").strip()
                or (getattr(user, "email", None) or "").strip()
                or (getattr(user, "username", None) or "").strip()
                or f"Usuario {uid}"
            )
            tasks_detail = []
            effort_total = 0
            for task_row in sorted(
                (by_user_tasks.get(uid) or {}).values(),
                key=lambda item: item["consumed_seconds"],
                reverse=True,
            ):
                effort_total += int(task_row.get("effort_points") or 0)
                tasks_detail.append(
                    {
                        **task_row,
                        "consumed_hours": round(task_row["consumed_seconds"] / 3600, 2),
                    }
                )
            by_collaborator.append(
                {
                    "user_id": uid,
                    "name": label,
                    "email": getattr(user, "email", "") or "",
                    "is_staff": is_admin_user,
                    "user_type": "admin" if is_admin_user else "collaborator",
                    "consumed_seconds": seconds,
                    "consumed_hours": round(seconds / 3600, 2),
                    "effort_points_total": effort_total,
                    "tasks_count": len(tasks_detail),
                    "tasks": tasks_detail,
                }
            )

        by_collaborator.sort(key=lambda item: item["consumed_seconds"], reverse=True)
        consumed = filtered_consumed

        lines = ContractServiceLine.objects.select_related("contract", "service")
        if client_id:
            lines = lines.filter(contract__client_id=client_id)
        # amount e dinheiro; effort_points nas tarefas e proxy de horas contratadas
        tasks = Task.objects.all()
        if project_id:
            tasks = tasks.filter(board__project_id=project_id)
        if client_id:
            tasks = tasks.filter(board__project__client_id=client_id)
        if user_id:
            tasks = tasks.filter(assignee_id=user_id)
        # No periodo: esforco das tarefas que tiveram apontamento no intervalo
        if start_dt or end_dt:
            task_ids = {
                str(row["task_id"])
                for collab in by_collaborator
                for row in (collab.get("tasks") or [])
                if row.get("task_id")
            }
            tasks = tasks.filter(pk__in=task_ids) if task_ids else tasks.none()
        effort = tasks.aggregate(total=Sum("effort_points"))["total"] or 0
        contracted_hours = float(effort)  # 1 ponto ~ 1h (heuristica do dashboard)
        contract_amount_total = float(sum((line.amount or 0) for line in lines[:500]))

        return success_response(
            correlation_id=correlation_id,
            data={
                "consumed_seconds": consumed,
                "consumed_hours": round(consumed / 3600, 2),
                "contracted_hours": contracted_hours,
                "effort_points_total": effort,
                "contract_amount_total": contract_amount_total,
                "by_collaborator": by_collaborator,
                "period": {
                    "period": str(request.query_params.get("period") or "all"),
                    "date_from": str(request.query_params.get("date_from") or ""),
                    "date_to": str(request.query_params.get("date_to") or ""),
                    "start": start_dt.isoformat().replace("+00:00", "Z") if start_dt else None,
                    "end": end_dt.isoformat().replace("+00:00", "Z") if end_dt else None,
                },
                "user_role": user_role,
                "generated_at": timezone.now().isoformat().replace("+00:00", "Z"),
            },
        )
