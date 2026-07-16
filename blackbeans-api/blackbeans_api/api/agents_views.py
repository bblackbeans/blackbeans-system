from __future__ import annotations

import uuid

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.agent_service import OVERDUE_AGENT_SLUG
from blackbeans_api.governance.agent_service import execute_overdue_tasks_weekly_agent
from blackbeans_api.governance.models import AgentDefinition
from blackbeans_api.governance.models import AgentRun
from blackbeans_api.governance.tasks import run_overdue_tasks_weekly_agent


def agent_definition_to_representation(agent: AgentDefinition, *, last_run: AgentRun | None = None) -> dict:
    payload = {
        "id": str(agent.pk),
        "slug": agent.slug,
        "title": agent.title,
        "description": agent.description,
        "schedule_hint": agent.schedule_hint,
        "is_enabled": agent.is_enabled,
        "created_at": agent.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": agent.updated_at.isoformat().replace("+00:00", "Z"),
        "last_run": agent_run_to_representation(last_run, include_report=False) if last_run else None,
    }
    return payload


def agent_run_to_representation(run: AgentRun | None, *, include_report: bool = True) -> dict | None:
    if run is None:
        return None
    payload = {
        "id": str(run.pk),
        "agent_slug": run.agent.slug if getattr(run, "agent_id", None) else None,
        "status": run.status,
        "started_at": run.started_at.isoformat().replace("+00:00", "Z") if run.started_at else None,
        "finished_at": run.finished_at.isoformat().replace("+00:00", "Z") if run.finished_at else None,
        "summary_text": run.summary_text,
        "correlation_id": run.correlation_id,
        "error_message": run.error_message,
        "triggered_by_id": run.triggered_by_id,
    }
    if include_report:
        payload["report"] = run.report_json or {}
    else:
        payload["total_overdue"] = int((run.report_json or {}).get("total_overdue") or 0)
    return payload


class AgentListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        agents = list(AgentDefinition.objects.all().order_by("title"))
        last_runs: dict[str, AgentRun] = {}
        for run in (
            AgentRun.objects.filter(agent__in=agents)
            .select_related("agent")
            .order_by("agent_id", "-started_at")
        ):
            key = str(run.agent_id)
            if key not in last_runs:
                last_runs[key] = run
        return success_response(
            correlation_id=correlation_id,
            data={
                "agents": [
                    agent_definition_to_representation(
                        agent,
                        last_run=last_runs.get(str(agent.pk)),
                    )
                    for agent in agents
                ],
            },
            meta={"total": len(agents)},
        )


class AgentRunListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, slug: str):
        correlation_id = get_correlation_id(request)
        try:
            agent = AgentDefinition.objects.get(slug=slug)
        except AgentDefinition.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="agent_not_found",
                message="Agente nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
            page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 50)
        except (TypeError, ValueError):
            page, page_size = 1, 20
        qs = AgentRun.objects.filter(agent=agent).select_related("agent").order_by("-started_at")
        total = qs.count()
        start = (page - 1) * page_size
        rows = list(qs[start : start + page_size])
        return success_response(
            correlation_id=correlation_id,
            data={
                "agent": agent_definition_to_representation(agent),
                "runs": [agent_run_to_representation(run, include_report=True) for run in rows],
            },
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
            },
        )


class AgentRunDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, slug: str, run_id: uuid.UUID):
        correlation_id = get_correlation_id(request)
        try:
            run = AgentRun.objects.select_related("agent").get(pk=run_id, agent__slug=slug)
        except AgentRun.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="agent_run_not_found",
                message="Execucao do agente nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"run": agent_run_to_representation(run, include_report=True)},
        )


class AgentRunNowView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, slug: str):
        correlation_id = get_correlation_id(request)
        try:
            agent = AgentDefinition.objects.get(slug=slug)
        except AgentDefinition.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="agent_not_found",
                message="Agente nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if not agent.is_enabled:
            return error_response(
                correlation_id=correlation_id,
                code="agent_disabled",
                message="Este agente esta desabilitado.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        async_flag = str(request.query_params.get("async") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        if slug == OVERDUE_AGENT_SLUG:
            if async_flag:
                run_overdue_tasks_weekly_agent.delay(
                    correlation_id=correlation_id,
                    triggered_by_id=request.user.pk,
                )
                return success_response(
                    correlation_id=correlation_id,
                    data={"queued": True, "agent_slug": slug},
                    http_status=status.HTTP_202_ACCEPTED,
                )
            run = execute_overdue_tasks_weekly_agent(
                correlation_id=correlation_id,
                triggered_by=request.user,
            )
            return success_response(
                correlation_id=correlation_id,
                data={"run": agent_run_to_representation(run, include_report=True)},
                http_status=status.HTTP_201_CREATED,
            )

        return error_response(
            correlation_id=correlation_id,
            code="agent_runner_missing",
            message="Este agente ainda nao possui runner implementado.",
            details={"slug": slug},
            http_status=status.HTTP_501_NOT_IMPLEMENTED,
        )
