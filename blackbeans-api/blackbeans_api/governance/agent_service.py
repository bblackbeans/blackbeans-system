from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Max
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.governance.llm_client import complete_text
from blackbeans_api.governance.llm_client import is_llm_enabled
from blackbeans_api.governance.models import AgentDefinition
from blackbeans_api.governance.models import AgentRun
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.notification_service import dispatch_notification
from blackbeans_api.governance.notification_service import get_user_display_name

User = get_user_model()
logger = logging.getLogger(__name__)

OVERDUE_AGENT_SLUG = "overdue_tasks_weekly"
BLOCKED_STALE_AGENT_SLUG = "blocked_stale_tasks"

_OVERDUE_SYSTEM_PROMPT = (
    "Voce e um analista de operacoes de projetos. Com base APENAS no JSON fornecido "
    "(tarefas atrasadas), escreva em portugues do Brasil um briefing curto para administradores: "
    "(1) top 5 riscos, (2) possiveis causas, (3) plano sugerido para a semana. "
    "Nao invente tarefas, IDs ou numeros que nao estejam no JSON. "
    "Se nao houver atrasos, diga que a operacao esta em dia."
)

_BLOCKED_SYSTEM_PROMPT = (
    "Voce e um analista de operacoes de projetos. Com base APENAS no JSON fornecido "
    "(tarefas bloqueadas ou paradas), escreva em portugues do Brasil um briefing curto: "
    "quais itens perguntar 'ainda esta vivo?', quem cobrar e proxima acao sugerida. "
    "Nao invente tarefas, IDs ou numeros fora do JSON. "
    "Se a lista estiver vazia, diga que nao ha bloqueios ou tarefas paradas no criterio."
)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _compact_report_for_llm(report: dict[str, Any], *, item_limit: int = 40) -> dict[str, Any]:
    items = list(report.get("items") or [])[:item_limit]
    compact_items = []
    for row in items:
        compact_items.append(
            {
                "title": row.get("title"),
                "status": row.get("status"),
                "priority": row.get("priority"),
                "days_overdue": row.get("days_overdue"),
                "days_idle": row.get("days_idle"),
                "reason": row.get("reason"),
                "assignee_name": row.get("assignee_name"),
                "project_name": row.get("project_name"),
            },
        )
    return {
        "generated_at": report.get("generated_at"),
        "total_overdue": report.get("total_overdue"),
        "total_flagged": report.get("total_flagged"),
        "by_project": (report.get("by_project") or [])[:10],
        "by_assignee": (report.get("by_assignee") or [])[:10],
        "by_reason": report.get("by_reason") or [],
        "items": compact_items,
    }


def fallback_overdue_briefing(report: dict[str, Any]) -> str:
    total = int(report.get("total_overdue") or 0)
    if total == 0:
        return "Nenhuma tarefa atrasada no momento. Operacao em dia segundo o criterio de prazo."
    lines = [
        f"Resumo automatico (sem IA): {total} tarefa(s) com prazo vencido.",
        "Top riscos por projeto:",
    ]
    for row in (report.get("by_project") or [])[:5]:
        lines.append(f"- {row.get('project_name')}: {row.get('count')}")
    lines.append("Top por responsavel:")
    for row in (report.get("by_assignee") or [])[:5]:
        lines.append(f"- {row.get('assignee_name')}: {row.get('count')}")
    lines.append(
        "Plano sugerido: revisar as mais antigas primeiro, confirmar responsavel ativo "
        "e renegociar prazo ou prioridade com o time.",
    )
    return "\n".join(lines)


def fallback_blocked_stale_briefing(report: dict[str, Any]) -> str:
    total = int(report.get("total_flagged") or 0)
    if total == 0:
        return "Nenhuma tarefa bloqueada ou parada nos criterios atuais."
    lines = [
        f"Resumo automatico (sem IA): {total} tarefa(s) sinalizada(s).",
    ]
    for row in report.get("by_reason") or []:
        lines.append(f"- Motivo {row.get('reason')}: {row.get('count')}")
    lines.append("Itens para perguntar 'ainda esta vivo?':")
    for row in (report.get("items") or [])[:8]:
        lines.append(
            f"- {row.get('title')} ({row.get('project_name')}) — "
            f"{row.get('reason')}, {row.get('days_idle')} dia(s) sem movimento, "
            f"resp. {row.get('assignee_name')}",
        )
    lines.append(
        "Proxima acao sugerida: cobrar update no comentario da tarefa ou "
        "mover para done/cancelado se nao fizer mais sentido.",
    )
    return "\n".join(lines)


def generate_ai_briefing(
    *,
    report: dict[str, Any],
    system_prompt: str,
    fallback_fn,
) -> tuple[str, str]:
    """Retorna (briefing, ai_mode) com modo openai ou fallback."""
    if is_llm_enabled():
        compact = _compact_report_for_llm(report)
        text = complete_text(
            system=system_prompt,
            user=json.dumps(compact, ensure_ascii=False),
        )
        if text:
            return text, "openai"
    return fallback_fn(report), "fallback"


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


def build_blocked_stale_tasks_report(*, now: datetime | None = None) -> dict[str, Any]:
    """Tarefas blocked ou sem movimento relevante ha N dias (somente leitura)."""
    current = now or timezone.now()
    stale_days = max(1, int(getattr(settings, "AGENT_STALE_DAYS", 7) or 7))
    cutoff = current - timedelta(days=stale_days)

    qs = (
        Task.objects.exclude(status=Task.Status.DONE)
        .select_related(
            "assignee",
            "board",
            "board__project",
            "board__project__portfolio",
            "board__project__portfolio__workspace",
        )
        .annotate(
            last_comment_at=Max("comments__created_at"),
            last_activity_at=Max("activities__created_at"),
        )
        .order_by("updated_at", "title")
    )

    items: list[dict[str, Any]] = []
    by_project: dict[str, int] = {}
    by_assignee: dict[str, int] = {}
    by_reason: dict[str, int] = {}

    for task in qs:
        timestamps = [task.updated_at]
        if task.last_comment_at:
            timestamps.append(task.last_comment_at)
        if task.last_activity_at:
            timestamps.append(task.last_activity_at)
        last_touch = max(timestamps)
        is_blocked = task.status == Task.Status.BLOCKED
        is_stale = last_touch < cutoff
        if not is_blocked and not is_stale:
            continue

        reason = "blocked" if is_blocked else "stale"
        project = task.board.project
        workspace = project.portfolio.workspace
        assignee = task.assignee
        assignee_id = assignee.pk if assignee and assignee.is_active else None
        assignee_name = (
            get_user_display_name(assignee)
            if assignee and assignee.is_active
            else ("Sem responsavel" if assignee is None else f"{get_user_display_name(assignee)} (inativo)")
        )
        days_idle = max(0, (current.date() - last_touch.date()).days)
        project_key = project.name or str(project.pk)
        by_project[project_key] = by_project.get(project_key, 0) + 1
        by_assignee[assignee_name] = by_assignee.get(assignee_name, 0) + 1
        by_reason[reason] = by_reason.get(reason, 0) + 1
        items.append(
            {
                "task_id": str(task.pk),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "reason": reason,
                "days_idle": days_idle,
                "last_touch_at": _iso(last_touch),
                "end_date": _iso(task.end_date),
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

    items.sort(key=lambda row: (-int(row.get("days_idle") or 0), str(row.get("title") or "")))
    return {
        "generated_at": _iso(current),
        "stale_days": stale_days,
        "total_flagged": len(items),
        "by_reason": [
            {"reason": name, "count": count}
            for name, count in sorted(by_reason.items(), key=lambda row: (-row[1], row[0]))
        ],
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


def _admin_recipients() -> list:
    return list(
        User.objects.filter(is_active=True).filter(Q(is_staff=True) | Q(is_superuser=True)),
    )


def notify_admins_of_agent_report(
    *,
    report: dict[str, Any],
    run: AgentRun,
    correlation_id: str,
    title: str,
    intro: str,
) -> int:
    admins = _admin_recipients()
    briefing = str(report.get("ai_briefing") or "").strip()
    message = intro
    if briefing:
        message += f"\n\nAnalise:\n{briefing}"
    message += f"\n\nVeja o relatorio completo em Administracao > Agentes (run {run.pk})."
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
            "total_overdue": int(report.get("total_overdue") or 0),
            "total_flagged": int(report.get("total_flagged") or 0),
            "ai_mode": report.get("ai_mode"),
            "deep_link_hash": "#agents",
        },
        correlation_id=correlation_id,
        dedupe=False,
    )
    return len(admins)


def notify_admins_of_overdue_report(
    *,
    report: dict[str, Any],
    run: AgentRun,
    correlation_id: str,
) -> int:
    total = int(report.get("total_overdue") or 0)
    top_projects = report.get("by_project") or []
    preview_lines = [f"- {row['project_name']}: {row['count']}" for row in top_projects[:5]]
    intro = (
        f"O agente '{run.agent.title}' encontrou {total} tarefa(s) com prazo vencido.\n"
        + ("Por projeto:\n" + "\n".join(preview_lines) if preview_lines else "Nenhuma tarefa atrasada.")
    )
    return notify_admins_of_agent_report(
        report=report,
        run=run,
        correlation_id=correlation_id,
        title=f"Relatorio semanal: {total} tarefa(s) atrasada(s)",
        intro=intro,
    )


def notify_admins_of_blocked_stale_report(
    *,
    report: dict[str, Any],
    run: AgentRun,
    correlation_id: str,
) -> int:
    total = int(report.get("total_flagged") or 0)
    reason_lines = [
        f"- {row['reason']}: {row['count']}" for row in (report.get("by_reason") or [])
    ]
    intro = (
        f"O agente '{run.agent.title}' sinalizou {total} tarefa(s) bloqueada(s) ou parada(s).\n"
        + ("Por motivo:\n" + "\n".join(reason_lines) if reason_lines else "Nenhum item no criterio.")
    )
    return notify_admins_of_agent_report(
        report=report,
        run=run,
        correlation_id=correlation_id,
        title=f"Detector de bloqueio: {total} tarefa(s) sinalizada(s)",
        intro=intro,
    )


def _ensure_agent(slug: str, defaults: dict[str, Any]) -> AgentDefinition:
    agent, _ = AgentDefinition.objects.get_or_create(slug=slug, defaults=defaults)
    return agent


OVERDUE_AGENT_DEFAULTS: dict[str, Any] = {
    "title": "Tarefas atrasadas (semanal)",
    "description": (
        "Varre tarefas com prazo vencido, gera briefing (IA ou fallback) "
        "e notifica administradores."
    ),
    "schedule_hint": "Toda segunda-feira as 09:50 (America/Sao_Paulo)",
    "is_enabled": True,
}

BLOCKED_STALE_AGENT_DEFAULTS: dict[str, Any] = {
    "title": "Detector de bloqueio (diario)",
    "description": (
        "Identifica tarefas blocked ou sem movimento ha 7 dias, "
        "gera briefing (IA ou fallback) e notifica administradores (somente leitura)."
    ),
    "schedule_hint": "Todo dia as 10:00 (America/Sao_Paulo)",
    "is_enabled": True,
}


def ensure_agent_catalog() -> list[AgentDefinition]:
    """Garante que os agentes conhecidos existam no catalogo (idempotente)."""
    overdue = _ensure_agent(OVERDUE_AGENT_SLUG, OVERDUE_AGENT_DEFAULTS)
    blocked = _ensure_agent(BLOCKED_STALE_AGENT_SLUG, BLOCKED_STALE_AGENT_DEFAULTS)
    return [overdue, blocked]


def _finish_failed_run(run: AgentRun, *, summary: str, error: str) -> AgentRun:
    run.status = AgentRun.Status.FAILED
    run.error_message = error[:2000]
    run.summary_text = summary
    run.finished_at = timezone.now()
    run.save(update_fields=["status", "error_message", "summary_text", "finished_at"])
    return run


def execute_overdue_tasks_weekly_agent(
    *,
    correlation_id: str | None = None,
    triggered_by: User | None = None,
) -> AgentRun:
    """Executa o agente de atrasos: grava AgentRun, briefing IA, notifica admins."""
    corr = (correlation_id or str(uuid.uuid4())).strip()
    agent = _ensure_agent(OVERDUE_AGENT_SLUG, OVERDUE_AGENT_DEFAULTS)
    if not agent.is_enabled and triggered_by is None:
        return AgentRun.objects.create(
            agent=agent,
            status=AgentRun.Status.FAILED,
            summary_text="Agente desabilitado; execucao automatica ignorada.",
            report_json={"skipped": True, "reason": "disabled"},
            correlation_id=corr,
            finished_at=timezone.now(),
            error_message="agent_disabled",
        )

    run = AgentRun.objects.create(
        agent=agent,
        status=AgentRun.Status.RUNNING,
        correlation_id=corr,
        triggered_by=triggered_by,
    )
    try:
        report = build_overdue_tasks_report()
        briefing, ai_mode = generate_ai_briefing(
            report=report,
            system_prompt=_OVERDUE_SYSTEM_PROMPT,
            fallback_fn=fallback_overdue_briefing,
        )
        report["ai_briefing"] = briefing
        report["ai_mode"] = ai_mode
        total = int(report.get("total_overdue") or 0)
        notified = notify_admins_of_overdue_report(
            report=report,
            run=run,
            correlation_id=corr,
        )
        run.report_json = report
        run.summary_text = (
            f"{total} tarefa(s) atrasada(s). Briefing={ai_mode}. "
            f"Notificacao enviada para {notified} admin(s)."
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
            "agent.overdue_weekly.success run_id=%s total=%s ai_mode=%s notified=%s correlation_id=%s",
            run.pk,
            total,
            ai_mode,
            notified,
            corr,
        )
    except Exception as exc:  # noqa: BLE001 — persist failure on AgentRun
        logger.exception("agent.overdue_weekly.failed run_id=%s correlation_id=%s", run.pk, corr)
        return _finish_failed_run(
            run,
            summary="Falha ao executar o agente de tarefas atrasadas.",
            error=str(exc),
        )
    return run


def execute_blocked_stale_tasks_agent(
    *,
    correlation_id: str | None = None,
    triggered_by: User | None = None,
) -> AgentRun:
    """Executa detector de bloqueio / tarefas paradas."""
    corr = (correlation_id or str(uuid.uuid4())).strip()
    stale_days = max(1, int(getattr(settings, "AGENT_STALE_DAYS", 7) or 7))
    agent = _ensure_agent(BLOCKED_STALE_AGENT_SLUG, BLOCKED_STALE_AGENT_DEFAULTS)
    if not agent.is_enabled and triggered_by is None:
        return AgentRun.objects.create(
            agent=agent,
            status=AgentRun.Status.FAILED,
            summary_text="Agente desabilitado; execucao automatica ignorada.",
            report_json={"skipped": True, "reason": "disabled"},
            correlation_id=corr,
            finished_at=timezone.now(),
            error_message="agent_disabled",
        )

    run = AgentRun.objects.create(
        agent=agent,
        status=AgentRun.Status.RUNNING,
        correlation_id=corr,
        triggered_by=triggered_by,
    )
    try:
        report = build_blocked_stale_tasks_report()
        briefing, ai_mode = generate_ai_briefing(
            report=report,
            system_prompt=_BLOCKED_SYSTEM_PROMPT,
            fallback_fn=fallback_blocked_stale_briefing,
        )
        report["ai_briefing"] = briefing
        report["ai_mode"] = ai_mode
        total = int(report.get("total_flagged") or 0)
        notified = notify_admins_of_blocked_stale_report(
            report=report,
            run=run,
            correlation_id=corr,
        )
        run.report_json = report
        run.summary_text = (
            f"{total} tarefa(s) sinalizada(s). Briefing={ai_mode}. "
            f"Notificacao enviada para {notified} admin(s)."
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
            "agent.blocked_stale.success run_id=%s total=%s ai_mode=%s notified=%s correlation_id=%s",
            run.pk,
            total,
            ai_mode,
            notified,
            corr,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("agent.blocked_stale.failed run_id=%s correlation_id=%s", run.pk, corr)
        return _finish_failed_run(
            run,
            summary="Falha ao executar o detector de bloqueio.",
            error=str(exc),
        )
    return run
