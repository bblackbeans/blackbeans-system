from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.governance.models import AgentDefinition
from blackbeans_api.governance.models import AgentRun
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.notification_service import dispatch_notification
from blackbeans_api.governance.notification_service import get_user_display_name

User = get_user_model()
logger = logging.getLogger(__name__)

OVERDUE_AGENT_SLUG = "overdue_tasks_weekly"


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def build_overdue_tasks_report(*, now: datetime | None = None) -> dict[str, Any]:
    """Monta relatorio agregado de tarefas atrasadas (somente leitura)."""
    current = now or timezone.now()
    qs = (
        Task.objects.filter(end_date__lt=current)
        .exclude(status=Task.Status.DONE)
        .select_related(
            "assignee",
            "board",
            "board__project",
            "board__project__portfolio",
            "board__project__portfolio__workspace",
        )
        .order_by("end_date", "title")
    )

    items: list[dict[str, Any]] = []
    by_project: dict[str, int] = {}
    by_assignee: dict[str, int] = {}

    for task in qs:
        project = task.board.project
        workspace = project.portfolio.workspace
        assignee = task.assignee
        assignee_id = assignee.pk if assignee and assignee.is_active else None
        assignee_name = (
            get_user_display_name(assignee)
            if assignee and assignee.is_active
            else ("Sem responsavel" if assignee is None else f"{get_user_display_name(assignee)} (inativo)")
        )
        days_overdue = max(0, (current.date() - task.end_date.date()).days) if task.end_date else 0
        project_key = project.name or str(project.pk)
        by_project[project_key] = by_project.get(project_key, 0) + 1
        by_assignee[assignee_name] = by_assignee.get(assignee_name, 0) + 1
        items.append(
            {
                "task_id": str(task.pk),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "end_date": _iso(task.end_date),
                "days_overdue": days_overdue,
                "assignee_id": assignee_id,
                "assignee_name": assignee_name,
                "project_id": str(project.pk),
                "project_name": project.name or "Projeto",
                "workspace_id": str(workspace.pk),
                "workspace_name": workspace.name,
                "board_id": str(task.board_id),
                "board_name": task.board.name or "Quadro",
            },
        )

    return {
        "generated_at": _iso(current),
        "total_overdue": len(items),
        "by_project": [
            {"project_name": name, "count": count}
            for name, count in sorted(by_project.items(), key=lambda row: (-row[1], row[0]))
        ],
        "by_assignee": [
            {"assignee_name": name, "count": count}
            for name, count in sorted(by_assignee.items(), key=lambda row: (-row[1], row[0]))
        ],
        "items": items,
    }


def notify_admins_of_overdue_report(
    *,
    report: dict[str, Any],
    run: AgentRun,
    correlation_id: str,
) -> int:
    admins = list(
        User.objects.filter(is_active=True).filter(Q(is_staff=True) | Q(is_superuser=True)),
    )
    total = int(report.get("total_overdue") or 0)
    title = f"Relatorio semanal: {total} tarefa(s) atrasada(s)"
    top_projects = report.get("by_project") or []
    preview_lines = [
        f"- {row['project_name']}: {row['count']}"
        for row in top_projects[:5]
    ]
    message = (
        f"O agente '{run.agent.title}' encontrou {total} tarefa(s) com prazo vencido.\n"
        + ("Por projeto:\n" + "\n".join(preview_lines) if preview_lines else "Nenhuma tarefa atrasada.")
        + f"\n\nVeja o relatorio completo em Administracao > Agentes (run {run.pk})."
    )
    dispatch_notification(
        event_type=Notification.Type.AGENT_REPORT,
        recipients=admins,
        actor=None,
        title=title,
        message=message,
        task=None,
        metadata={
            "agent_slug": run.agent.slug,
            "agent_run_id": str(run.pk),
            "total_overdue": total,
            "deep_link_hash": "#agents",
        },
        correlation_id=correlation_id,
        dedupe=False,
    )
    return len(admins)


def execute_overdue_tasks_weekly_agent(
    *,
    correlation_id: str | None = None,
    triggered_by: User | None = None,
) -> AgentRun:
    """Executa o agente de atrasos: grava AgentRun, notifica admins."""
    corr = (correlation_id or str(uuid.uuid4())).strip()
    agent, _ = AgentDefinition.objects.get_or_create(
        slug=OVERDUE_AGENT_SLUG,
        defaults={
            "title": "Tarefas atrasadas (semanal)",
            "description": (
                "Varre tarefas com prazo vencido e notifica administradores com o relatorio."
            ),
            "schedule_hint": "Toda segunda-feira as 09:50 (America/Sao_Paulo)",
            "is_enabled": True,
        },
    )
    if not agent.is_enabled and triggered_by is None:
        run = AgentRun.objects.create(
            agent=agent,
            status=AgentRun.Status.FAILED,
            summary_text="Agente desabilitado; execucao automatica ignorada.",
            report_json={"skipped": True, "reason": "disabled"},
            correlation_id=corr,
            finished_at=timezone.now(),
            error_message="agent_disabled",
        )
        return run

    run = AgentRun.objects.create(
        agent=agent,
        status=AgentRun.Status.RUNNING,
        correlation_id=corr,
        triggered_by=triggered_by,
    )
    try:
        report = build_overdue_tasks_report()
        total = int(report.get("total_overdue") or 0)
        notified = notify_admins_of_overdue_report(
            report=report,
            run=run,
            correlation_id=corr,
        )
        run.report_json = report
        run.summary_text = (
            f"{total} tarefa(s) atrasada(s). Notificacao enviada para {notified} admin(s)."
        )
        run.status = AgentRun.Status.SUCCESS
        run.finished_at = timezone.now()
        run.save(
            update_fields=[
                "report_json",
                "summary_text",
                "status",
                "finished_at",
            ],
        )
        logger.info(
            "agent.overdue_weekly.success run_id=%s total=%s notified=%s correlation_id=%s",
            run.pk,
            total,
            notified,
            corr,
        )
    except Exception as exc:  # noqa: BLE001 — persist failure on AgentRun
        logger.exception("agent.overdue_weekly.failed run_id=%s correlation_id=%s", run.pk, corr)
        run.status = AgentRun.Status.FAILED
        run.error_message = str(exc)[:2000]
        run.summary_text = "Falha ao executar o agente de tarefas atrasadas."
        run.finished_at = timezone.now()
        run.save(
            update_fields=[
                "status",
                "error_message",
                "summary_text",
                "finished_at",
            ],
        )
    return run
