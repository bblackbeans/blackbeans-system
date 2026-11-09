"""Catalogo de gatilhos, condicoes, acoes e receitas prontas das automacoes."""

from __future__ import annotations

from typing import Any

from blackbeans_api.governance.models import Task

# --- Gatilhos -----------------------------------------------------------------

EVENT_TRIGGERS = {
    "task.created": {
        "label": "Quando uma tarefa for criada",
        "config": [],
    },
    "task.status_changed": {
        "label": "Quando o status mudar",
        "config": [
            {"key": "from_status", "type": "status", "label": "De (opcional)"},
            {"key": "to_status", "type": "status", "label": "Para (opcional)"},
        ],
    },
    "task.assignee_changed": {
        "label": "Quando o responsavel mudar",
        "config": [{"key": "assignee_id", "type": "user", "label": "Novo responsavel (opcional)"}],
    },
    "task.priority_changed": {
        "label": "Quando a prioridade mudar",
        "config": [{"key": "to_priority", "type": "priority", "label": "Para (opcional)"}],
    },
    "task.moved_to_group": {
        "label": "Quando a tarefa mudar de grupo",
        "config": [{"key": "group_id", "type": "group", "label": "Grupo de destino (opcional)"}],
    },
    "task.comment_added": {
        "label": "Quando houver novo comentario",
        "config": [],
    },
    "task.title_changed": {
        "label": "Quando o nome da tarefa mudar",
        "config": [],
    },
    "task.moved_to_board": {
        "label": "Quando a tarefa mudar de quadro",
        "config": [],
    },
    "task.archived": {
        "label": "Quando a tarefa for arquivada",
        "config": [],
    },
}

SCHEDULED_TRIGGERS = {
    "task.due_soon": {
        "label": "Quando o prazo estiver chegando",
        "config": [{"key": "days_before", "type": "number", "label": "Dias de antecedencia", "required": True}],
    },
    "task.overdue": {
        "label": "Quando o prazo vencer",
        "config": [],
    },
    "schedule.recurring": {
        "label": "Em horario recorrente",
        "config": [
            {"key": "frequency", "type": "choice", "choices": ["daily", "weekly", "monthly"], "required": True},
            {"key": "weekday", "type": "number", "label": "Dia da semana (0=seg ... 6=dom)"},
            {"key": "day_of_month", "type": "number", "label": "Dia do mes (1-28)"},
            {"key": "hour", "type": "number", "label": "Hora (0-23)", "required": True},
        ],
    },
}

MANUAL_TRIGGERS = {
    "task.button": {
        "label": "Quando o botao for clicado na tarefa",
        "config": [],
    },
}

TRIGGERS: dict[str, dict[str, Any]] = {**EVENT_TRIGGERS, **SCHEDULED_TRIGGERS, **MANUAL_TRIGGERS}

# --- Condicoes ----------------------------------------------------------------

CONDITION_FIELDS = ("status", "priority", "assignee_id", "group_id", "board_id", "parent_id", "title", "effort_points", "end_date")
CONDITION_OPS = ("eq", "neq", "in", "not_in", "contains", "is_empty", "not_empty", "gt", "lt")

# --- Acoes --------------------------------------------------------------------

ACTIONS: dict[str, dict[str, Any]] = {
    "set_status": {
        "label": "Alterar status",
        "config": [{"key": "status", "type": "status", "required": True}],
    },
    "set_priority": {
        "label": "Alterar prioridade",
        "config": [{"key": "priority", "type": "priority", "required": True}],
    },
    "set_assignee": {
        "label": "Atribuir responsavel",
        "config": [{"key": "assignee_id", "type": "user", "label": "Usuario (vazio remove o responsavel)"}],
    },
    "move_to_group": {
        "label": "Mover para grupo",
        "config": [{"key": "group_id", "type": "group", "required": True}],
    },
    "set_due_date": {
        "label": "Definir prazo final",
        "config": [
            {"key": "days_from_now", "type": "number", "label": "Dias a partir de agora"},
            {"key": "clear", "type": "boolean", "label": "Limpar prazo"},
        ],
    },
    "add_comment": {
        "label": "Adicionar comentario",
        "config": [{"key": "content", "type": "text", "required": True}],
    },
    "notify": {
        "label": "Enviar notificacao",
        "config": [
            {"key": "recipients", "type": "recipients", "required": True, "label": "assignee, owner ou ids de usuario"},
            {"key": "title", "type": "text"},
            {"key": "message", "type": "text", "required": True},
        ],
    },
    "create_subtask": {
        "label": "Criar subtarefa",
        "config": [
            {"key": "title", "type": "text", "required": True},
            {"key": "assignee_id", "type": "user"},
        ],
    },
    "archive_task": {
        "label": "Arquivar tarefa",
        "config": [],
    },
    "push_date": {
        "label": "Empurrar uma data",
        "config": [
            {"key": "field", "type": "choice", "choices": ["end_date", "start_date"], "label": "Data"},
            {"key": "amount", "type": "number", "required": True, "label": "Quantidade (negativo volta)"},
            {"key": "unit", "type": "choice", "choices": ["days", "weeks", "months"], "label": "Unidade"},
        ],
    },
    "set_effort": {
        "label": "Definir pontos de esforco",
        "config": [{"key": "points", "type": "number", "required": True}],
    },
    "move_to_board": {
        "label": "Mover para outro quadro",
        "config": [{"key": "group_id", "type": "any_group", "required": True, "label": "Quadro / grupo de destino"}],
    },
    "duplicate_task": {
        "label": "Duplicar a tarefa",
        "config": [{"key": "group_id", "type": "any_group", "label": "Quadro / grupo de destino (vazio = mesmo)"}],
    },
    "create_task": {
        "label": "Criar tarefa em um quadro",
        "config": [
            {"key": "group_id", "type": "any_group", "required": True, "label": "Quadro / grupo de destino"},
            {"key": "title", "type": "text", "required": True},
            {"key": "assignee_id", "type": "user"},
        ],
    },
    "delete_task": {
        "label": "Excluir a tarefa (definitivo)",
        "config": [],
    },
}

MAX_ACTIONS = 10
MAX_CONDITIONS = 10

# --- Receitas prontas (modelos) ------------------------------------------------

RECIPES: list[dict[str, Any]] = [
    {
        "key": "done_notify_owner",
        "name": "Concluiu? Avise o criador da automacao",
        "description": "Quando o status virar Concluida, envia uma notificacao.",
        "trigger_type": "task.status_changed",
        "trigger_config": {"to_status": Task.Status.DONE},
        "conditions": [],
        "actions": [
            {"type": "notify", "config": {"recipients": "owner", "title": "Tarefa concluida", "message": "{{task.title}} foi concluida."}},
        ],
    },
    {
        "key": "blocked_comment",
        "name": "Bloqueou? Comente e suba a prioridade",
        "description": "Ao bloquear uma tarefa, registra comentario e define prioridade alta.",
        "trigger_type": "task.status_changed",
        "trigger_config": {"to_status": Task.Status.BLOCKED},
        "conditions": [],
        "actions": [
            {"type": "set_priority", "config": {"priority": Task.Priority.HIGH}},
            {"type": "add_comment", "config": {"content": "Tarefa bloqueada automaticamente sinalizada como prioridade alta."}},
        ],
    },
    {
        "key": "assigned_start",
        "name": "Atribuiu? Coloque em andamento",
        "description": "Quando alguem for atribuido a uma tarefa A fazer, muda para Em andamento.",
        "trigger_type": "task.assignee_changed",
        "trigger_config": {},
        "conditions": [{"field": "status", "op": "eq", "value": Task.Status.TODO}, {"field": "assignee_id", "op": "not_empty"}],
        "actions": [{"type": "set_status", "config": {"status": Task.Status.IN_PROGRESS}}],
    },
    {
        "key": "due_soon_alert",
        "name": "Prazo em 2 dias? Avise o responsavel",
        "description": "Notifica o responsavel 2 dias antes do prazo final.",
        "trigger_type": "task.due_soon",
        "trigger_config": {"days_before": 2},
        "conditions": [{"field": "assignee_id", "op": "not_empty"}],
        "actions": [{"type": "notify", "config": {"recipients": "assignee", "title": "Prazo chegando", "message": "{{task.title}} vence em breve."}}],
    },
    {
        "key": "overdue_escalate",
        "name": "Venceu? Escale a prioridade",
        "description": "Tarefas vencidas ficam com prioridade critica e notificam o criador da automacao.",
        "trigger_type": "task.overdue",
        "trigger_config": {},
        "conditions": [],
        "actions": [
            {"type": "set_priority", "config": {"priority": Task.Priority.CRITICAL}},
            {"type": "notify", "config": {"recipients": "owner", "title": "Tarefa vencida", "message": "{{task.title}} esta vencida."}},
        ],
    },
    {
        "key": "new_task_checklist",
        "name": "Nova tarefa? Crie a subtarefa de revisao",
        "description": "Toda tarefa nova ganha uma subtarefa de revisao.",
        "trigger_type": "task.created",
        "trigger_config": {},
        "conditions": [],
        "actions": [{"type": "create_subtask", "config": {"title": "Revisar: {{task.title}}"}}],
    },
    {
        "key": "weekly_digest",
        "name": "Toda segunda, cobre tarefas abertas",
        "description": "Segunda as 9h, notifica o responsavel de cada tarefa ainda aberta.",
        "trigger_type": "schedule.recurring",
        "trigger_config": {"frequency": "weekly", "weekday": 0, "hour": 9},
        "conditions": [{"field": "assignee_id", "op": "not_empty"}],
        "actions": [{"type": "notify", "config": {"recipients": "assignee", "title": "Tarefa em aberto", "message": "{{task.title}} ainda esta em aberto."}}],
    },
    {
        "key": "button_archive",
        "name": "Botao: concluir e arquivar",
        "description": "Botao manual que conclui e arquiva a tarefa.",
        "trigger_type": "task.button",
        "trigger_config": {},
        "conditions": [],
        "actions": [
            {"type": "set_status", "config": {"status": Task.Status.DONE}},
            {"type": "archive_task", "config": {}},
        ],
    },
]


def catalog_payload() -> dict[str, Any]:
    return {
        "triggers": [{"type": k, **v} for k, v in TRIGGERS.items()],
        "actions": [{"type": k, **v} for k, v in ACTIONS.items()],
        "condition_fields": list(CONDITION_FIELDS),
        "condition_ops": list(CONDITION_OPS),
        "recipes": RECIPES,
        "template_variables": ["task.title", "task.number", "task.status", "task.priority", "task.assignee", "automation.name"],
    }


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_definition(
    *,
    trigger_type: Any,
    trigger_config: Any,
    conditions: Any,
    actions: Any,
) -> dict[str, list[str]]:
    """Valida a estrutura (sem tocar no banco). Retorna {campo: [mensagens]}."""
    errors: dict[str, list[str]] = {}

    def add(field: str, msg: str) -> None:
        errors.setdefault(field, []).append(msg)

    if trigger_type not in TRIGGERS:
        add("trigger_type", "Gatilho desconhecido.")
    if not isinstance(trigger_config, dict):
        add("trigger_config", "Deve ser um objeto.")
        trigger_config = {}
    if trigger_type == "task.due_soon":
        days = trigger_config.get("days_before")
        if not _is_int(days) or not 0 <= days <= 90:
            add("trigger_config", "days_before deve ser um inteiro entre 0 e 90.")
    if trigger_type == "schedule.recurring":
        freq = trigger_config.get("frequency")
        hour = trigger_config.get("hour")
        if freq not in {"daily", "weekly", "monthly"}:
            add("trigger_config", "frequency deve ser daily, weekly ou monthly.")
        if not _is_int(hour) or not 0 <= hour <= 23:
            add("trigger_config", "hour deve ser inteiro entre 0 e 23.")
        if freq == "weekly" and (not _is_int(trigger_config.get("weekday")) or not 0 <= trigger_config["weekday"] <= 6):
            add("trigger_config", "weekday deve ser inteiro entre 0 e 6.")
        if freq == "monthly" and (not _is_int(trigger_config.get("day_of_month")) or not 1 <= trigger_config["day_of_month"] <= 28):
            add("trigger_config", "day_of_month deve ser inteiro entre 1 e 28.")

    if not isinstance(conditions, list):
        add("conditions", "Deve ser uma lista.")
    else:
        if len(conditions) > MAX_CONDITIONS:
            add("conditions", f"No maximo {MAX_CONDITIONS} condicoes.")
        for i, cond in enumerate(conditions):
            if not isinstance(cond, dict) or cond.get("field") not in CONDITION_FIELDS or cond.get("op") not in CONDITION_OPS:
                add("conditions", f"Condicao #{i + 1} invalida.")

    if not isinstance(actions, list) or not actions:
        add("actions", "Informe ao menos uma acao.")
    else:
        if len(actions) > MAX_ACTIONS:
            add("actions", f"No maximo {MAX_ACTIONS} acoes.")
        for i, act in enumerate(actions):
            if not isinstance(act, dict) or act.get("type") not in ACTIONS:
                add("actions", f"Acao #{i + 1} invalida.")
                continue
            cfg = act.get("config") or {}
            if not isinstance(cfg, dict):
                add("actions", f"Configuracao da acao #{i + 1} invalida.")
                continue
            for spec in ACTIONS[act["type"]]["config"]:
                if spec.get("required") and cfg.get(spec["key"]) in (None, "", []):
                    add("actions", f"Acao #{i + 1}: '{spec['key']}' e obrigatorio.")
    return errors
