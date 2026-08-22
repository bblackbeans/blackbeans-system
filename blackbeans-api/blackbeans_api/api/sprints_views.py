from __future__ import annotations

from datetime import datetime
from datetime import time
from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.board_status import status_bucket
from blackbeans_api.governance.models import SprintItem
from blackbeans_api.governance.models import SprintWeek
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskStatusDefinition
from blackbeans_api.governance.models import TimeLog

STATUS_LABEL_PT = {
    "todo": "A fazer",
    "in_progress": "Em andamento",
    "blocked": "Bloqueada",
    "done": "Concluida",
}


def _iso(value) -> str | None:
    if not value:
        return None
    return value.isoformat().replace("+00:00", "Z")


def monday_friday_for(day=None) -> tuple:
    today = day or timezone.localdate()
    monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


def week_bounds_dt(week_start, week_end):
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(week_start, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(week_end, time.max), tz)
    return start_dt, end_dt


def exclude_status_keys() -> set[str]:
    keys: set[str] = {"todo", "done", "BACKLOG", "CONCLUÍDO", "CONCLUIDO", "concluido"}
    for row in TaskStatusDefinition.objects.filter(is_active=True):
        if status_bucket(row.key, label=row.label) in {"backlog", "done"}:
            keys.add(row.key)
    return keys


def hours_for_task(task_id) -> Decimal:
    total = (
        TimeLog.objects.filter(task_id=task_id)
        .exclude(status=TimeLog.Status.DELETED)
        .aggregate(total=Sum("accumulated_seconds"))
        .get("total")
        or 0
    )
    return (Decimal(total) / Decimal(3600)).quantize(Decimal("0.01"))


def status_catalog() -> dict[str, dict[str, str]]:
    return {
        row.key: {"label": row.label, "color": row.color or ""}
        for row in TaskStatusDefinition.objects.filter(is_active=True)
    }


def _task_project_client(task: Task | None) -> tuple[str, str]:
    if task is None:
        return "", ""
    try:
        project = task.board.project
        project_name = project.name or ""
        client = getattr(project, "client", None)
        client_name = (client.name if client else "") or ""
        return project_name, client_name
    except Exception:  # noqa: BLE001
        return "", ""


def item_to_representation(item: SprintItem, catalog: dict[str, dict[str, str]] | None = None) -> dict:
    assignee = item.assignee
    project_name = item.project_name
    client_name = item.client_name
    priority = item.priority
    if item.task_id:
        live_project, live_client = _task_project_client(item.task)
        if not project_name:
            project_name = live_project
        if not client_name:
            client_name = live_client
        if not priority:
            priority = item.task.priority or ""
    meta = (catalog or {}).get(item.status) or {}
    status_label = meta.get("label") or STATUS_LABEL_PT.get(item.status, item.status or "—")
    return {
        "id": str(item.pk),
        "sprint_id": str(item.sprint_id),
        "task_id": str(item.task_id) if item.task_id else None,
        "assignee_id": assignee.pk if assignee else None,
        "assignee_name": (assignee.name or assignee.username or assignee.email) if assignee else "Sem responsavel",
        "title": item.title,
        "status": item.status,
        "status_label": status_label,
        "status_color": meta.get("color") or "",
        "priority": priority,
        "start_date": _iso(item.start_date),
        "end_date": _iso(item.end_date),
        "effort_points": item.effort_points,
        "hours_logged": str(item.hours_logged),
        "project_name": project_name,
        "client_name": client_name,
        "updated_at": _iso(item.updated_at),
    }


def week_to_representation(week: SprintWeek, *, include_items: bool = False) -> dict:
    payload = {
        "id": str(week.pk),
        "week_start": week.week_start.isoformat(),
        "week_end": week.week_end.isoformat(),
        "label": f"{week.week_start.strftime('%d/%m')}–{week.week_end.strftime('%d/%m')}",
        "locked_at": _iso(week.locked_at),
        "locked_by_id": week.locked_by_id,
        "is_locked": week.is_locked,
        "items_count": week.items.count() if not include_items else None,
        "created_at": _iso(week.created_at),
        "updated_at": _iso(week.updated_at),
    }
    if include_items:
        catalog = status_catalog()
        items = list(week.items.select_related("assignee", "task__board__project__client").all())
        payload["items"] = [item_to_representation(item, catalog) for item in items]
        payload["items_count"] = len(items)
    return payload


def generate_snapshot(week: SprintWeek) -> int:
    start_dt, end_dt = week_bounds_dt(week.week_start, week.week_end)
    excluded = exclude_status_keys()
    qs = (
        Task.objects.filter(assignee_id__isnull=False)
        .exclude(status__in=excluded)
        .annotate(due=Coalesce("end_date", "start_date"))
        .filter(due__gte=start_dt, due__lte=end_dt)
        .select_related("assignee", "board__project__client")
    )
    SprintItem.objects.filter(sprint=week).delete()
    created = 0
    for task in qs:
        if status_bucket(task.status) in {"backlog", "done"}:
            continue
        project_name, client_name = _task_project_client(task)
        SprintItem.objects.create(
            sprint=week,
            task=task,
            assignee=task.assignee,
            title=task.title,
            status=task.status,
            start_date=task.start_date,
            end_date=task.end_date,
            effort_points=task.effort_points or 0,
            hours_logged=hours_for_task(task.pk),
            project_name=project_name,
            client_name=client_name,
            priority=task.priority or "",
        )
        created += 1
    return created


class SprintWeekListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        weeks = list(SprintWeek.objects.all()[:52])
        monday, friday = monday_friday_for()
        has_current = any(row.week_start == monday and row.week_end == friday for row in weeks)
        data = [week_to_representation(row) for row in weeks]
        return success_response(
            correlation_id=correlation_id,
            data={
                "weeks": data,
                "current_week": {
                    "week_start": monday.isoformat(),
                    "week_end": friday.isoformat(),
                    "label": f"{monday.strftime('%d/%m')}–{friday.strftime('%d/%m')}",
                    "exists": has_current,
                },
            },
            meta={"total": len(data)},
        )


class SprintWeekGenerateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        raw = request.data.get("week_start")
        parsed = parse_date(str(raw)) if raw else None
        monday, friday = monday_friday_for(parsed)
        week, _created = SprintWeek.objects.get_or_create(
            week_start=monday,
            week_end=friday,
        )
        if week.is_locked:
            return error_response(
                correlation_id=correlation_id,
                code="sprint_locked",
                message="Sprint travada. Nao e possivel regenerar.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        count = generate_snapshot(week)
        week = SprintWeek.objects.prefetch_related("items__assignee").get(pk=week.pk)
        return success_response(
            correlation_id=correlation_id,
            data={"week": week_to_representation(week, include_items=True), "generated": count},
        )


class SprintWeekDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, sprint_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            week = SprintWeek.objects.prefetch_related("items__assignee", "items__task").get(pk=sprint_id)
        except SprintWeek.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Sprint nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"week": week_to_representation(week, include_items=True)},
        )


class SprintWeekLockView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, sprint_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            week = SprintWeek.objects.get(pk=sprint_id)
        except SprintWeek.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Sprint nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if week.is_locked:
            return error_response(
                correlation_id=correlation_id,
                code="sprint_locked",
                message="Sprint ja esta travada.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        week.locked_at = timezone.now()
        week.locked_by = request.user
        week.save(update_fields=["locked_at", "locked_by", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"week": week_to_representation(week)},
        )


class SprintWeekUnlockView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, sprint_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            week = SprintWeek.objects.get(pk=sprint_id)
        except SprintWeek.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Sprint nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if not week.is_locked:
            return error_response(
                correlation_id=correlation_id,
                code="sprint_unlocked",
                message="Sprint ja esta aberta.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        week.locked_at = None
        week.locked_by = None
        week.save(update_fields=["locked_at", "locked_by", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"week": week_to_representation(week)},
        )


class SprintItemDateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def patch(self, request: Request, sprint_id: UUID, item_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            item = SprintItem.objects.select_related("sprint", "task__board__project__client").get(
                pk=item_id, sprint_id=sprint_id
            )
        except SprintItem.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Item da sprint nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if item.sprint.is_locked:
            return error_response(
                correlation_id=correlation_id,
                code="sprint_locked",
                message="Sprint travada. A pasta nao muda mais.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        start_raw = request.data.get("start_date")
        end_raw = request.data.get("end_date")
        start_date = item.start_date
        end_date = item.end_date
        if "start_date" in request.data:
            start_date = _parse_dt(start_raw)
        if "end_date" in request.data:
            end_date = _parse_dt(end_raw)
        start_dt, end_dt = week_bounds_dt(item.sprint.week_start, item.sprint.week_end)
        due = end_date or start_date
        with transaction.atomic():
            item.start_date = start_date
            item.end_date = end_date
            if item.task_id:
                task = item.task
                task.start_date = start_date
                task.end_date = end_date
                task.save(update_fields=["start_date", "end_date", "updated_at"])
            if due is not None and (due < start_dt or due > end_dt):
                item.delete()
                return success_response(
                    correlation_id=correlation_id,
                    data={"moved_out": True, "item": None},
                )
            item.save(update_fields=["start_date", "end_date", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"moved_out": False, "item": item_to_representation(item, status_catalog())},
        )


def _parse_dt(raw):
    if raw in (None, ""):
        return None
    parsed = parse_datetime(str(raw))
    if parsed is None and len(str(raw)) == 10:
        parsed = parse_datetime(f"{raw}T12:00:00")
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed
