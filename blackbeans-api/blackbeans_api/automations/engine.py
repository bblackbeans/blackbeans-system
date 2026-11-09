"""Motor de execucao das automacoes: casa evento -> condicoes -> acoes."""

from __future__ import annotations

import logging
import re
import time
from contextvars import ContextVar
from datetime import datetime
from datetime import timedelta
import calendar
from typing import Any
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.automations.models import Automation
from blackbeans_api.automations.models import AutomationRun
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskActivity
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import TaskStatusDefinition

logger = logging.getLogger(__name__)
User = get_user_model()

MAX_DEPTH = 4
LOCAL_TZ = ZoneInfo("America/Sao_Paulo")

# Contexto da cadeia em execucao: evita laco infinito entre automacoes que se disparam.
_depth: ContextVar[int] = ContextVar("automation_depth", default=0)
_chain: ContextVar[tuple[str, ...]] = ContextVar("automation_chain", default=())


def current_depth() -> int:
    return _depth.get()


def current_chain() -> list[str]:
    return list(_chain.get())


class ActionError(Exception):
    """Falha esperada de uma acao (configuracao invalida, alvo inexistente)."""


# --- Condicoes ------------------------------------------------------------------

def _task_field(task: Task, field: str) -> Any:
    value = getattr(task, field, None)
    if field in {"assignee_id", "group_id", "board_id", "parent_id"} and value is not None:
        return str(value)
    if field == "effort_points" and value is not None:
        return float(value)
    if field == "end_date" and value is not None:
        return value
    return value


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == []


def evaluate_condition(task: Task, cond: dict) -> bool:
    actual = _task_field(task, cond["field"])
    op = cond["op"]
    expected = cond.get("value")
    if op == "is_empty":
        return _is_empty(actual)
    if op == "not_empty":
        return not _is_empty(actual)
    if op in {"eq", "neq"}:
        same = str(actual) == str(expected) if actual is not None and expected is not None else actual == expected
        return same if op == "eq" else not same
    if op in {"in", "not_in"}:
        values = expected if isinstance(expected, list) else [expected]
        found = actual is not None and str(actual) in {str(v) for v in values}
        return found if op == "in" else not found
    if op == "contains":
        return expected is not None and str(expected).lower() in str(actual or "").lower()
    if op in {"gt", "lt"}:
        if actual is None or expected is None:
            return False
        try:
            if isinstance(actual, datetime):
                exp = datetime.fromisoformat(str(expected).replace("Z", "+00:00"))
                return actual > exp if op == "gt" else actual < exp
            return float(actual) > float(expected) if op == "gt" else float(actual) < float(expected)
        except (TypeError, ValueError):
            return False
    return False


def conditions_pass(task: Task, conditions: list[dict]) -> bool:
    return all(evaluate_condition(task, c) for c in conditions or [])


def trigger_matches(automation: Automation, event: dict) -> bool:
    cfg = automation.trigger_config or {}
    changes = event.get("changes") or {}
    t = automation.trigger_type
    if t == "task.status_changed":
        if cfg.get("to_status") and changes.get("to_status") != cfg["to_status"]:
            return False
        if cfg.get("from_status") and changes.get("from_status") != cfg["from_status"]:
            return False
    elif t == "task.assignee_changed":
        if cfg.get("assignee_id") and str(changes.get("assignee_id")) != str(cfg["assignee_id"]):
            return False
    elif t == "task.priority_changed":
        if cfg.get("to_priority") and changes.get("to_priority") != cfg["to_priority"]:
            return False
    elif t == "task.moved_to_group":
        if cfg.get("group_id") and str(changes.get("group_id")) != str(cfg["group_id"]):
            return False
    return True


# --- Templates ------------------------------------------------------------------

_VAR_RE = re.compile(r"\{\{\s*([a-z_.]+)\s*\}\}")


def render_template(text: str, *, task: Task, automation: Automation) -> str:
    assignee = ""
    if task.assignee_id:
        a = task.assignee
        assignee = (a.name or a.get_username()) if a else ""
    values = {
        "task.title": task.title,
        "task.number": task.number if task.number is not None else "",
        "task.status": task.status,
        "task.priority": task.priority,
        "task.assignee": assignee,
        "automation.name": automation.name,
    }
    return _VAR_RE.sub(lambda m: str(values.get(m.group(1), "")), text or "")


# --- Acoes ----------------------------------------------------------------------

def _save_task(task: Task, fields: list[str]) -> None:
    task.save(update_fields=[*fields, "updated_at"])


def _log_activity(automation: Automation, task: Task, summary: str) -> None:
    if automation.created_by_id is None:
        return
    TaskActivity.objects.create(
        task=task,
        actor_id=automation.created_by_id,
        event_type="task.automation",
        summary=f"[Automacao: {automation.name}] {summary}",
    )


def _act_set_status(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.api.operations_views import _close_open_time_logs_for_task
    from blackbeans_api.api.operations_views import _spawn_next_recurrence
    from blackbeans_api.api.operations_views import _sync_task_placement_by_status
    from blackbeans_api.governance.board_status import status_bucket

    new_status = cfg.get("status")
    if not TaskStatusDefinition.objects.filter(key=new_status, is_active=True).exists():
        raise ActionError(f"Status '{new_status}' nao existe ou esta inativo.")
    if task.status == new_status:
        return "Status ja era o desejado."
    if dry:
        return f"Alteraria status para {new_status}."
    before = task.status
    fields = ["status"]
    with transaction.atomic():
        if status_bucket(new_status) == "done":
            _close_open_time_logs_for_task(task)
            if task.end_date is None:
                task.end_date = timezone.now()
                fields.append("end_date")
        task.status = new_status
        _save_task(task, fields)
        _sync_task_placement_by_status(task)
        task.refresh_from_db()
        if status_bucket(new_status) == "done" and status_bucket(before) != "done":
            _spawn_next_recurrence(task)
    _log_activity(automation, task, f"Status alterado de {before} para {new_status}.")
    return f"Status: {before} -> {new_status}."


def _act_set_priority(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    value = cfg.get("priority")
    if value not in Task.Priority.values:
        raise ActionError(f"Prioridade '{value}' invalida.")
    if task.priority == value:
        return "Prioridade ja era a desejada."
    if dry:
        return f"Alteraria prioridade para {value}."
    before = task.priority
    task.priority = value
    _save_task(task, ["priority"])
    _log_activity(automation, task, f"Prioridade alterada de {before} para {value}.")
    return f"Prioridade: {before} -> {value}."


def _act_set_assignee(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    raw = cfg.get("assignee_id")
    user = None
    if raw not in (None, ""):
        user = User.objects.filter(pk=raw, is_active=True).first()
        if user is None:
            raise ActionError("Usuario responsavel nao encontrado ou inativo.")
    if task.assignee_id == (user.pk if user else None):
        return "Responsavel ja era o desejado."
    if dry:
        return "Alteraria o responsavel."
    task.assignee = user
    _save_task(task, ["assignee"])
    _log_activity(automation, task, f"Responsavel definido: {user.get_username() if user else 'ninguem'}.")
    if user and automation.created_by_id:
        from blackbeans_api.governance.notification_service import dispatch_task_assigned

        dispatch_task_assigned(task=task, assignee=user, actor=automation.created_by, correlation_id=f"automation:{automation.pk}")
    return "Responsavel atualizado."


def _act_move_to_group(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    group = BoardGroup.objects.filter(pk=cfg.get("group_id"), board_id=task.board_id).first()
    if group is None:
        raise ActionError("Grupo nao encontrado neste quadro.")
    if task.group_id == group.pk:
        return "Tarefa ja estava no grupo."
    if dry:
        return f"Moveria para o grupo '{group.name}'."
    task.group = group
    _save_task(task, ["group"])
    _log_activity(automation, task, f"Movida para o grupo '{group.name}'.")
    return f"Movida para '{group.name}'."


def _act_set_due_date(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    if cfg.get("clear"):
        if dry:
            return "Limparia o prazo."
        task.end_date = None
        _save_task(task, ["end_date"])
        _log_activity(automation, task, "Prazo final removido.")
        return "Prazo removido."
    days = cfg.get("days_from_now")
    if not isinstance(days, int) or isinstance(days, bool) or not -3650 <= days <= 3650:
        raise ActionError("days_from_now deve ser um inteiro valido.")
    new_end = timezone.now() + timedelta(days=days)
    if dry:
        return f"Definiria prazo em {days} dia(s)."
    task.end_date = new_end
    _save_task(task, ["end_date"])
    _log_activity(automation, task, f"Prazo final definido para {new_end:%d/%m/%Y}.")
    return f"Prazo: {new_end:%d/%m/%Y}."


def _act_add_comment(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    if automation.created_by_id is None:
        raise ActionError("Automacao sem autor: nao e possivel comentar.")
    content = render_template(str(cfg.get("content") or ""), task=task, automation=automation).strip()
    if not content:
        raise ActionError("Comentario vazio.")
    if dry:
        return "Adicionaria comentario."
    TaskComment.objects.create(task=task, author_id=automation.created_by_id, content=content)
    return "Comentario adicionado."


def _act_notify(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.governance.notification_service import dispatch_notification

    raw = cfg.get("recipients")
    tokens = raw if isinstance(raw, list) else [raw]
    users: dict[int, Any] = {}
    for tok in tokens:
        if tok == "assignee":
            if task.assignee_id and task.assignee:
                users[task.assignee.pk] = task.assignee
        elif tok == "owner":
            if automation.created_by_id and automation.created_by:
                users[automation.created_by.pk] = automation.created_by
        elif tok not in (None, ""):
            user = User.objects.filter(pk=tok, is_active=True).first()
            if user:
                users[user.pk] = user
    if not users:
        return "Nenhum destinatario valido; nada enviado."
    if dry:
        return f"Notificaria {len(users)} usuario(s)."
    title = render_template(str(cfg.get("title") or automation.name), task=task, automation=automation)[:255]
    message = render_template(str(cfg.get("message") or ""), task=task, automation=automation)
    dispatch_notification(
        event_type=Notification.Type.UPDATED,
        recipients=list(users.values()),
        actor=automation.created_by,
        title=title,
        message=message,
        task=task,
        metadata={"automation_id": str(automation.pk)},
        correlation_id=f"automation:{automation.pk}",
        dedupe=False,
    )
    return f"Notificou {len(users)} usuario(s)."


def _act_create_subtask(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.api.operations_serializers import allocate_next_task_number

    title = render_template(str(cfg.get("title") or ""), task=task, automation=automation).strip()[:255]
    if not title:
        raise ActionError("Titulo da subtarefa vazio.")
    if dry:
        return f"Criaria a subtarefa '{title}'."
    assignee = None
    if cfg.get("assignee_id"):
        assignee = User.objects.filter(pk=cfg["assignee_id"], is_active=True).first()
    with transaction.atomic():
        sub = Task.objects.create(
            board_id=task.board_id,
            group_id=task.group_id,
            parent=task,
            number=allocate_next_task_number(board_id=task.board_id),
            title=title,
            status=Task.Status.TODO,
            assignee=assignee,
        )
    _log_activity(automation, task, f"Subtarefa '{sub.title}' criada.")
    return f"Subtarefa criada: {sub.title}."


def _act_archive_task(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    if task.archived_at is not None:
        return "Tarefa ja estava arquivada."
    if dry:
        return "Arquivaria a tarefa."
    task.archived_at = timezone.now()
    _save_task(task, ["archived_at"])
    _log_activity(automation, task, "Tarefa arquivada.")
    return "Tarefa arquivada."


def _act_delete_task(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    if dry:
        return "Excluiria a tarefa (definitivo)."
    title = task.title
    task.delete()
    task._automation_deleted = True  # type: ignore[attr-defined]
    return f"Tarefa '{title}' excluida."


def _add_months(value: datetime, months: int) -> datetime:
    total = value.month - 1 + months
    year, month = value.year + total // 12, total % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _act_push_date(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    field = cfg.get("field") or "end_date"
    if field not in {"end_date", "start_date"}:
        raise ActionError("Campo de data invalido.")
    amount, unit = cfg.get("amount"), cfg.get("unit") or "days"
    if not isinstance(amount, int) or isinstance(amount, bool) or not -3650 <= amount <= 3650 or amount == 0:
        raise ActionError("Informe uma quantidade inteira diferente de zero.")
    if unit not in {"days", "weeks", "months"}:
        raise ActionError("Unidade invalida.")
    current = getattr(task, field)
    if current is None:
        raise ActionError("A tarefa nao tem essa data para empurrar.")
    new_value = _add_months(current, amount) if unit == "months" else current + timedelta(days=amount * (7 if unit == "weeks" else 1))
    label = "prazo final" if field == "end_date" else "data de inicio"
    if dry:
        return f"Empurraria o {label} para {new_value:%d/%m/%Y}."
    setattr(task, field, new_value)
    _save_task(task, [field])
    _log_activity(automation, task, f"{label.capitalize()} empurrado para {new_value:%d/%m/%Y}.")
    return f"{label.capitalize()}: {new_value:%d/%m/%Y}."


def _act_set_effort(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    points = cfg.get("points")
    if isinstance(points, bool) or not isinstance(points, (int, float)) or not 0 <= points <= 9999:
        raise ActionError("Pontos de esforco devem ser um numero entre 0 e 9999.")
    if dry:
        return f"Definiria o esforco para {points}."
    task.effort_points = points
    _save_task(task, ["effort_points"])
    _log_activity(automation, task, f"Esforco definido para {points}.")
    return f"Esforco: {points}."


def _target_group(automation: Automation, group_id: Any) -> BoardGroup:
    """Grupo de destino; so vale dentro da area de trabalho da automacao."""
    try:
        group = (
            BoardGroup.objects.select_related("board")
            .filter(pk=group_id, board__project__portfolio__workspace_id=automation.workspace_id)
            .first()
        )
    except (ValueError, TypeError, DjangoValidationError):
        group = None
    if group is None:
        raise ActionError("Grupo de destino nao encontrado nesta area de trabalho.")
    return group


def _act_move_to_board(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.api.operations_serializers import allocate_next_task_number

    group = _target_group(automation, cfg.get("group_id"))
    if task.board_id == group.board_id:
        raise ActionError("A tarefa ja esta nesse quadro. Use 'Mover para grupo'.")
    if dry:
        return f"Moveria para '{group.board}' / '{group.name}' (com as subtarefas)."
    with transaction.atomic():
        children = list(task.subtasks.all()) if hasattr(task, "subtasks") else list(Task.objects.filter(parent=task))
        task.board_id, task.group = group.board_id, group
        task.parent = None
        task.number = allocate_next_task_number(board_id=group.board_id)
        task._skip_automations = True  # evita disparar "mudou de grupo" alem do "mudou de quadro"
        task.save(update_fields=["board", "group", "parent", "number", "updated_at"])
        for child in children:
            child.board_id, child.group = group.board_id, group
            child.number = allocate_next_task_number(board_id=group.board_id)
            child._skip_automations = True
            child.save(update_fields=["board", "group", "number", "updated_at"])
    _log_activity(automation, task, f"Movida para o quadro '{group.board}' / '{group.name}'.")
    return f"Movida para '{group.board}' / '{group.name}'."


def _act_duplicate_task(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.api.operations_serializers import allocate_next_task_number

    group = _target_group(automation, cfg["group_id"]) if cfg.get("group_id") else task.group
    title = f"{task.title} (copia)"[:255]
    if dry:
        return f"Duplicaria a tarefa como '{title}'."
    with transaction.atomic():
        copy = Task.objects.create(
            board_id=group.board_id,
            group=group,
            parent=task.parent if group.board_id == task.board_id else None,
            number=allocate_next_task_number(board_id=group.board_id),
            title=title,
            description=task.description,
            status=Task.Status.TODO,
            priority=task.priority,
            effort_points=task.effort_points,
            assignee=task.assignee,
            start_date=task.start_date,
            end_date=task.end_date,
        )
    _log_activity(automation, task, f"Tarefa duplicada: '{copy.title}'.")
    return f"Duplicada: {copy.title}."


def _act_create_task(automation: Automation, task: Task, cfg: dict, dry: bool) -> str:
    from blackbeans_api.api.operations_serializers import allocate_next_task_number

    group = _target_group(automation, cfg.get("group_id"))
    title = render_template(str(cfg.get("title") or ""), task=task, automation=automation).strip()[:255]
    if not title:
        raise ActionError("Titulo da nova tarefa vazio.")
    if dry:
        return f"Criaria '{title}' em '{group.board}' / '{group.name}'."
    assignee = None
    if cfg.get("assignee_id"):
        assignee = User.objects.filter(pk=cfg["assignee_id"], is_active=True).first()
    with transaction.atomic():
        new = Task.objects.create(
            board_id=group.board_id,
            group=group,
            number=allocate_next_task_number(board_id=group.board_id),
            title=title,
            status=Task.Status.TODO,
            assignee=assignee,
        )
    _log_activity(automation, task, f"Tarefa '{new.title}' criada em '{group.board}'.")
    return f"Criada: {new.title}."


ACTION_HANDLERS = {
    "push_date": _act_push_date,
    "set_effort": _act_set_effort,
    "move_to_board": _act_move_to_board,
    "duplicate_task": _act_duplicate_task,
    "create_task": _act_create_task,
    "delete_task": _act_delete_task,
    "set_status": _act_set_status,
    "set_priority": _act_set_priority,
    "set_assignee": _act_set_assignee,
    "move_to_group": _act_move_to_group,
    "set_due_date": _act_set_due_date,
    "add_comment": _act_add_comment,
    "notify": _act_notify,
    "create_subtask": _act_create_subtask,
    "archive_task": _act_archive_task,
}


# --- Execucao -------------------------------------------------------------------

def run_automation(
    automation: Automation,
    task: Task,
    *,
    event: dict | None = None,
    dry_run: bool = False,
) -> AutomationRun:
    """Executa as acoes sobre a tarefa e grava o historico. Nunca levanta."""
    event = event or {}
    started = time.monotonic()
    depth = current_depth()
    chain = (*current_chain(), f"{automation.pk}:{task.pk}")
    log: list[dict] = []
    status = AutomationRun.Status.SUCCESS
    error = ""
    t_depth = _depth.set(depth + 1)
    t_chain = _chain.set(chain)
    try:
        for index, action in enumerate(automation.actions or []):
            handler = ACTION_HANDLERS.get(action.get("type"))
            if handler is None:
                status, error = AutomationRun.Status.FAILED, f"Acao desconhecida: {action.get('type')}"
                log.append({"index": index, "type": action.get("type"), "ok": False, "detail": error})
                break
            try:
                # Savepoint: falha parcial de uma acao nao deixa meia escrita no banco.
                with transaction.atomic():
                    detail = handler(automation, task, action.get("config") or {}, dry_run)
                log.append({"index": index, "type": action["type"], "ok": True, "detail": detail})
                if getattr(task, "_automation_deleted", False):
                    break
            except ActionError as exc:
                # Como no Monday: se uma acao falha, as seguintes continuam.
                status, error = AutomationRun.Status.FAILED, str(exc)
                log.append({"index": index, "type": action["type"], "ok": False, "detail": error})
                continue
            except Exception as exc:  # noqa: BLE001 - registrar e seguir com as demais automacoes
                logger.exception("Automacao %s falhou na acao %s", automation.pk, action.get("type"))
                status, error = AutomationRun.Status.FAILED, f"Erro inesperado: {exc.__class__.__name__}"
                log.append({"index": index, "type": action["type"], "ok": False, "detail": error})
                continue
    finally:
        _depth.reset(t_depth)
        _chain.reset(t_chain)
    run = AutomationRun.objects.create(
        automation=automation,
        task=None if getattr(task, "_automation_deleted", False) else task,
        status=status,
        trigger_type=automation.trigger_type if not event.get("trigger") else event["trigger"],
        event={k: v for k, v in event.items() if k in {"trigger", "changes", "actor_id"}},
        actions_log=log,
        error_message=error,
        depth=depth,
        is_dry_run=dry_run,
        duration_ms=int((time.monotonic() - started) * 1000),
    )
    if not dry_run:
        Automation.objects.filter(pk=automation.pk).update(
            run_count=F("run_count") + 1,
            last_run_at=timezone.now(),
        )
    return run


def _scope_filter(task: Task) -> Q:
    workspace_id = task.board.project.portfolio.workspace_id
    return Q(workspace_id=workspace_id) & (Q(board__isnull=True) | Q(board_id=task.board_id))


def process_event(event: dict) -> int:
    """Processa um evento de tarefa: devolve quantas automacoes rodaram."""
    if event.get("depth", 0) >= MAX_DEPTH:
        logger.warning("Automacao ignorada: profundidade maxima atingida (%s)", event)
        return 0
    task = (
        Task.objects.select_related("board__project__portfolio", "assignee")
        .filter(pk=event.get("task_id"))
        .first()
    )
    if task is None or (task.archived_at is not None and event.get("trigger") != "task.archived"):
        return 0
    chain = set(event.get("chain") or [])
    t_depth = _depth.set(int(event.get("depth", 0)))
    t_chain = _chain.set(tuple(chain))
    ran = 0
    try:
        qs = Automation.objects.filter(is_enabled=True, trigger_type=event["trigger"]).filter(_scope_filter(task))
        for automation in qs.select_related("created_by"):
            if f"{automation.pk}:{task.pk}" in chain:
                continue
            if not trigger_matches(automation, event):
                continue
            task.refresh_from_db()
            if not conditions_pass(task, automation.conditions):
                continue
            run_automation(automation, task, event=event)
            ran += 1
    finally:
        _depth.reset(t_depth)
        _chain.reset(t_chain)
    return ran


# --- Gatilhos agendados ---------------------------------------------------------

def _open_tasks_in_scope(automation: Automation):
    return (
        Task.objects.filter(
            board__project__portfolio__workspace_id=automation.workspace_id,
            archived_at__isnull=True,
        )
        .exclude(status__in=_done_keys())
        .select_related("board__project__portfolio", "assignee")
        .filter(Q(board_id=automation.board_id) if automation.board_id else Q())
    )


def _done_keys() -> list[str]:
    keys = list(TaskStatusDefinition.objects.filter(is_done_like=True).values_list("key", flat=True))
    return keys or [Task.Status.DONE]


def _already_ran(automation: Automation, task: Task, trigger: str) -> bool:
    return AutomationRun.objects.filter(
        automation=automation, task=task, trigger_type=trigger, is_dry_run=False,
    ).exists()


def last_scheduled_instant(cfg: dict, now: datetime) -> datetime:
    """Ultimo instante de agenda (<= now), no fuso de Sao Paulo."""
    local = now.astimezone(LOCAL_TZ)
    hour = int(cfg.get("hour", 0))
    candidate = local.replace(hour=hour, minute=0, second=0, microsecond=0)
    freq = cfg.get("frequency")
    if freq == "daily":
        if candidate > local:
            candidate -= timedelta(days=1)
    elif freq == "weekly":
        candidate -= timedelta(days=(local.weekday() - int(cfg.get("weekday", 0))) % 7)
        if candidate > local:
            candidate -= timedelta(days=7)
    elif freq == "monthly":
        dom = int(cfg.get("day_of_month", 1))
        candidate = candidate.replace(day=dom)
        if candidate > local:
            prev = (candidate.replace(day=1) - timedelta(days=1)).replace(day=dom, hour=hour)
            candidate = prev
    return candidate.astimezone(ZoneInfo("UTC"))


def run_scheduled_automations(*, now: datetime | None = None) -> dict[str, int]:
    """Avalia gatilhos de prazo e de agenda. Idempotente por (automacao, tarefa)."""
    now = now or timezone.now()
    ran = 0
    for automation in Automation.objects.filter(
        is_enabled=True,
        trigger_type__in=["task.due_soon", "task.overdue", "schedule.recurring"],
    ).select_related("created_by"):
        trigger = automation.trigger_type
        event = {"trigger": trigger, "changes": {}}
        try:
            if trigger == "schedule.recurring":
                due_at = last_scheduled_instant(automation.trigger_config or {}, now)
                if automation.last_scheduled_at is None:
                    # Primeira avaliacao: marca o ponto de partida sem recuperar o passado.
                    Automation.objects.filter(pk=automation.pk).update(last_scheduled_at=now)
                    continue
                if automation.last_scheduled_at >= due_at:
                    continue
                Automation.objects.filter(pk=automation.pk).update(last_scheduled_at=now)
                tasks = _open_tasks_in_scope(automation)
            elif trigger == "task.due_soon":
                days = int((automation.trigger_config or {}).get("days_before", 1))
                tasks = _open_tasks_in_scope(automation).filter(end_date__gt=now, end_date__lte=now + timedelta(days=days))
            else:
                tasks = _open_tasks_in_scope(automation).filter(end_date__lt=now)
            for task in tasks[:500]:
                if trigger != "schedule.recurring" and _already_ran(automation, task, trigger):
                    continue
                if not conditions_pass(task, automation.conditions):
                    continue
                run_automation(automation, task, event=event)
                ran += 1
        except Exception:  # noqa: BLE001 - uma automacao com erro nao derruba as demais
            logger.exception("Falha ao avaliar automacao agendada %s", automation.pk)
    return {"ran": ran}
