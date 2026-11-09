from __future__ import annotations

import uuid

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import HasStaffOrAdminArea
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.automations import engine
from blackbeans_api.automations.catalog import catalog_payload
from blackbeans_api.automations.catalog import validate_definition
from blackbeans_api.automations.models import Automation
from blackbeans_api.automations.models import AutomationRun
from blackbeans_api.governance.audit import log_audit_event
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import Workspace


def _iso(dt):
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def automation_to_representation(a: Automation) -> dict:
    return {
        "id": str(a.pk),
        "workspace_id": str(a.workspace_id),
        "board_id": str(a.board_id) if a.board_id else None,
        "name": a.name,
        "description": a.description,
        "is_enabled": a.is_enabled,
        "importance": a.importance,
        "trigger_type": a.trigger_type,
        "trigger_config": a.trigger_config,
        "conditions": a.conditions,
        "actions": a.actions,
        "run_count": a.run_count,
        "last_run_at": _iso(a.last_run_at),
        "created_by_id": a.created_by_id,
        "created_at": _iso(a.created_at),
        "updated_at": _iso(a.updated_at),
    }


def run_to_representation(r: AutomationRun) -> dict:
    return {
        "id": str(r.pk),
        "automation_id": str(r.automation_id),
        "automation_name": r.automation.name if r.automation_id else "",
        "task_id": str(r.task_id) if r.task_id else None,
        "task_title": r.task.title if r.task_id else None,
        "status": r.status,
        "trigger_type": r.trigger_type,
        "actions_log": r.actions_log,
        "error_message": r.error_message,
        "depth": r.depth,
        "is_dry_run": r.is_dry_run,
        "duration_ms": r.duration_ms,
        "created_at": _iso(r.created_at),
    }


def _validation_error(correlation_id: str, details: dict):
    return error_response(
        correlation_id=correlation_id,
        code="validation_error",
        message="Automacao invalida.",
        details=details,
        http_status=status.HTTP_400_BAD_REQUEST,
    )


def _not_found(correlation_id: str):
    return error_response(
        correlation_id=correlation_id,
        code="automation_not_found",
        message="Automacao nao encontrada.",
        details={},
        http_status=status.HTTP_404_NOT_FOUND,
    )


def _parse_uuid(raw):
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None


class AutomationCatalogView(APIView):
    permission_classes = [IsAuthenticated, HasStaffOrAdminArea("automations")]

    def get(self, request: Request):
        from django.contrib.auth import get_user_model

        from blackbeans_api.governance.models import TaskStatusDefinition

        users = get_user_model().objects.filter(is_active=True).order_by("name", "username")[:500]
        data = catalog_payload()
        data["users"] = [{"id": u.pk, "name": u.name or u.get_username()} for u in users]
        data["statuses"] = [
            {"key": s.key, "label": s.label}
            for s in TaskStatusDefinition.objects.filter(is_active=True).order_by("position", "key")
        ]
        from blackbeans_api.governance.models import BoardGroup

        data["target_groups"] = [
            {
                "id": str(g.pk),
                "workspace_id": str(g.board.project.portfolio.workspace_id),
                "label": f"{g.board.project.name}{' / ' + g.board.name if g.board.name else ''} / {g.name}",
            }
            for g in BoardGroup.objects.select_related("board__project__portfolio").order_by(
                "board__project__name", "board__name", "position"
            )[:2000]
        ]
        return success_response(correlation_id=get_correlation_id(request), data=data)


class AutomationListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasStaffOrAdminArea("automations")]

    def get(self, request: Request):
        cid = get_correlation_id(request)
        qs = Automation.objects.all().order_by("name")
        ws = request.query_params.get("workspace_id")
        if ws:
            if _parse_uuid(ws) is None:
                return _validation_error(cid, {"workspace_id": ["UUID invalido."]})
            qs = qs.filter(workspace_id=ws)
        board = request.query_params.get("board_id")
        if board:
            if _parse_uuid(board) is None:
                return _validation_error(cid, {"board_id": ["UUID invalido."]})
            qs = qs.filter(board_id=board)
        return success_response(correlation_id=cid, data={"automations": [automation_to_representation(a) for a in qs]})

    def post(self, request: Request):
        cid = get_correlation_id(request)
        data = request.data
        name = str(data.get("name") or "").strip()
        errors = validate_definition(
            trigger_type=data.get("trigger_type"),
            trigger_config=data.get("trigger_config") or {},
            conditions=data.get("conditions") or [],
            actions=data.get("actions"),
        )
        if not name:
            errors.setdefault("name", []).append("Informe um nome.")
        importance = data.get("importance") or Automation.Importance.NORMAL
        if importance not in Automation.Importance.values:
            errors.setdefault("importance", []).append("Importancia invalida.")
        workspace = Workspace.objects.filter(pk=_parse_uuid(data.get("workspace_id"))).first()
        if workspace is None:
            errors.setdefault("workspace_id", []).append("Area de trabalho nao encontrada.")
        board = None
        if data.get("board_id"):
            board = Board.objects.filter(pk=_parse_uuid(data.get("board_id"))).select_related("project__portfolio").first()
            if board is None or (workspace and board.project.portfolio.workspace_id != workspace.pk):
                errors.setdefault("board_id", []).append("Quadro nao pertence a esta area de trabalho.")
        if errors:
            return _validation_error(cid, errors)
        automation = Automation.objects.create(
            workspace=workspace,
            board=board,
            name=name[:255],
            description=str(data.get("description") or ""),
            is_enabled=bool(data.get("is_enabled", True)),
            importance=importance,
            trigger_type=data["trigger_type"],
            trigger_config=data.get("trigger_config") or {},
            conditions=data.get("conditions") or [],
            actions=data["actions"],
            created_by=request.user,
        )
        log_audit_event(
            event_type="automation.created",
            action="create",
            entity_type="automation",
            entity_id=str(automation.pk),
            actor_id=request.user.pk,
            workspace_id=str(workspace.pk),
            correlation_id=cid,
            after=automation_to_representation(automation),
        )
        return success_response(
            correlation_id=cid,
            data={"automation": automation_to_representation(automation)},
            http_status=status.HTTP_201_CREATED,
        )


class AutomationDetailView(APIView):
    permission_classes = [IsAuthenticated, HasStaffOrAdminArea("automations")]

    def get(self, request: Request, automation_id: uuid.UUID):
        cid = get_correlation_id(request)
        automation = Automation.objects.filter(pk=automation_id).first()
        if automation is None:
            return _not_found(cid)
        return success_response(correlation_id=cid, data={"automation": automation_to_representation(automation)})

    def patch(self, request: Request, automation_id: uuid.UUID):
        cid = get_correlation_id(request)
        automation = Automation.objects.filter(pk=automation_id).first()
        if automation is None:
            return _not_found(cid)
        data = request.data
        before = automation_to_representation(automation)
        merged = {
            "trigger_type": data.get("trigger_type", automation.trigger_type),
            "trigger_config": data.get("trigger_config", automation.trigger_config),
            "conditions": data.get("conditions", automation.conditions),
            "actions": data.get("actions", automation.actions),
        }
        errors = validate_definition(**merged)
        if "name" in data and not str(data.get("name") or "").strip():
            errors.setdefault("name", []).append("Informe um nome.")
        if "importance" in data and data["importance"] not in Automation.Importance.values:
            errors.setdefault("importance", []).append("Importancia invalida.")
        if errors:
            return _validation_error(cid, errors)
        if "importance" in data:
            automation.importance = data["importance"]
        if "name" in data:
            automation.name = str(data["name"]).strip()[:255]
        if "description" in data:
            automation.description = str(data["description"] or "")
        if "is_enabled" in data:
            automation.is_enabled = bool(data["is_enabled"])
        automation.trigger_type = merged["trigger_type"]
        automation.trigger_config = merged["trigger_config"] or {}
        automation.conditions = merged["conditions"] or []
        automation.actions = merged["actions"]
        if merged["trigger_config"] != before["trigger_config"] or merged["trigger_type"] != before["trigger_type"]:
            automation.last_scheduled_at = None
        automation.save()
        log_audit_event(
            event_type="automation.updated",
            action="update",
            entity_type="automation",
            entity_id=str(automation.pk),
            actor_id=request.user.pk,
            workspace_id=str(automation.workspace_id),
            correlation_id=cid,
            before=before,
            after=automation_to_representation(automation),
        )
        return success_response(correlation_id=cid, data={"automation": automation_to_representation(automation)})

    def delete(self, request: Request, automation_id: uuid.UUID):
        cid = get_correlation_id(request)
        automation = Automation.objects.filter(pk=automation_id).first()
        if automation is None:
            return _not_found(cid)
        log_audit_event(
            event_type="automation.deleted",
            action="delete",
            entity_type="automation",
            entity_id=str(automation.pk),
            actor_id=request.user.pk,
            workspace_id=str(automation.workspace_id),
            correlation_id=cid,
            before=automation_to_representation(automation),
        )
        automation.delete()
        return success_response(correlation_id=cid, data={"deleted": True})


class AutomationRunsView(APIView):
    permission_classes = [IsAuthenticated, HasStaffOrAdminArea("automations")]

    def get(self, request: Request, automation_id: uuid.UUID | None = None):
        cid = get_correlation_id(request)
        qs = AutomationRun.objects.select_related("automation", "task").order_by("-created_at")
        if automation_id:
            qs = qs.filter(automation_id=automation_id)
        ws = request.query_params.get("workspace_id")
        if ws:
            if _parse_uuid(ws) is None:
                return _validation_error(cid, {"workspace_id": ["UUID invalido."]})
            qs = qs.filter(automation__workspace_id=ws)
        try:
            limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
        except ValueError:
            limit = 50
        return success_response(correlation_id=cid, data={"runs": [run_to_representation(r) for r in qs[:limit]]})


class AutomationRunNowView(APIView):
    """Botao/teste: executa a automacao sobre uma tarefa (dry_run=true so simula)."""

    permission_classes = [IsAuthenticated, HasStaffOrAdminArea("automations")]

    def post(self, request: Request, automation_id: uuid.UUID):
        cid = get_correlation_id(request)
        automation = Automation.objects.select_related("created_by").filter(pk=automation_id).first()
        if automation is None:
            return _not_found(cid)
        task = (
            Task.objects.select_related("board__project__portfolio", "assignee")
            .filter(pk=_parse_uuid(request.data.get("task_id")))
            .first()
        )
        if task is None or task.board.project.portfolio.workspace_id != automation.workspace_id:
            return error_response(
                correlation_id=cid,
                code="task_not_found",
                message="Tarefa nao encontrada nesta area de trabalho.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if automation.board_id and automation.board_id != task.board_id:
            return _validation_error(cid, {"task_id": ["Tarefa fora do quadro da automacao."]})
        dry_run = bool(request.data.get("dry_run", False))
        with transaction.atomic():
            run = engine.run_automation(
                automation, task, event={"trigger": "task.button", "actor_id": request.user.pk}, dry_run=dry_run,
            )
        return success_response(correlation_id=cid, data={"run": run_to_representation(run)})
