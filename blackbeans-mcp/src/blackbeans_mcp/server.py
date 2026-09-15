from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from datetime import timezone
from typing import Any

from fastmcp import FastMCP

from blackbeans_mcp.client import BlackBeansApiError
from blackbeans_mcp.client import BlackBeansClient
from blackbeans_mcp.client import compact_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

mcp = FastMCP(
    "BlackBeans",
    instructions=(
        "MCP do BlackBeans System. Use whoami e list_my_tasks para contexto. "
        "Prefira IDs retornados pelas tools. Mutacoes sensiveis exigem confirm=true quando indicado."
    ),
)


def _client() -> BlackBeansClient:
    return BlackBeansClient()


def _ok(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def _err(exc: Exception) -> str:
    if isinstance(exc, BlackBeansApiError):
        payload = {"error": str(exc), "status_code": exc.status_code, "details": exc.payload}
    else:
        payload = {"error": str(exc)}
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)


@mcp.tool(annotations={"readOnlyHint": True})
def whoami() -> str:
    """Retorna o usuario autenticado pelo PAT (perfil e papel)."""
    try:
        data = _client().request("GET", "/me", tool="whoami")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_my_tasks(status: str | None = None, priority: str | None = None) -> str:
    """Lista tarefas atribuídas ao usuário autenticado."""
    try:
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        if priority:
            params["priority"] = priority
        data = _client().request("GET", "/my-tasks", params=params, tool="list_my_tasks")
        tasks = [compact_task(row) for row in data.get("tasks", [])]
        return _ok({"count": len(tasks), "tasks": tasks})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def search_tasks(
    search: str | None = None,
    board_id: str | None = None,
    status: str | None = None,
    assignee_id: str | None = None,
    roots_only: bool = True,
) -> str:
    """Busca tarefas visíveis ao usuário (filtros opcionais)."""
    try:
        params: dict[str, Any] = {}
        if search:
            params["search"] = search
        if board_id:
            params["board_id"] = board_id
        if status:
            params["status"] = status
        if assignee_id:
            params["assignee_id"] = assignee_id
        if roots_only:
            params["roots_only"] = "true"
        data = _client().request("GET", "/tasks", params=params, tool="search_tasks")
        tasks = [compact_task(row) for row in data.get("tasks", [])]
        return _ok({"count": len(tasks), "tasks": tasks})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def get_task(task_id: str) -> str:
    """Detalhe compacto de uma tarefa."""
    try:
        data = _client().request("GET", f"/tasks/{task_id}", tool="get_task")
        task = data.get("task") or data
        return _ok(compact_task(task) if isinstance(task, dict) else task)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"destructiveHint": False})
def create_task(
    title: str,
    group_id: str,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    effort_points: int | None = None,
    dry_run: bool = False,
) -> str:
    """Cria tarefa em um grupo de quadro. Use dry_run=true para só validar o payload."""
    body: dict[str, Any] = {"title": title, "group_id": group_id}
    if description is not None:
        body["description"] = description
    if status is not None:
        body["status"] = status
    if priority is not None:
        body["priority"] = priority
    if assignee_id is not None:
        body["assignee_id"] = assignee_id
    if start_date is not None:
        body["start_date"] = start_date
    if end_date is not None:
        body["end_date"] = end_date
    if effort_points is not None:
        body["effort_points"] = effort_points
    if dry_run:
        return _ok({"dry_run": True, "payload": body})
    try:
        data = _client().request("POST", "/tasks", json_body=body, tool="create_task")
        task = data.get("task") or data
        return _ok(compact_task(task) if isinstance(task, dict) else task)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    priority: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    effort_points: int | None = None,
    status: str | None = None,
    dry_run: bool = False,
) -> str:
    """Atualiza campos de uma tarefa (parcial)."""
    body: dict[str, Any] = {}
    if title is not None:
        body["title"] = title
    if description is not None:
        body["description"] = description
    if priority is not None:
        body["priority"] = priority
    if start_date is not None:
        body["start_date"] = start_date
    if end_date is not None:
        body["end_date"] = end_date
    if effort_points is not None:
        body["effort_points"] = effort_points
    if status is not None:
        body["status"] = status
    if not body:
        return _err(ValueError("Informe ao menos um campo para atualizar."))
    if dry_run:
        return _ok({"dry_run": True, "task_id": task_id, "payload": body})
    try:
        data = _client().request("PATCH", f"/tasks/{task_id}", json_body=body, tool="update_task")
        task = data.get("task") or data
        return _ok(compact_task(task) if isinstance(task, dict) else task)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def set_task_status(task_id: str, status: str, complete: bool = False) -> str:
    """Altera status da tarefa. Se complete=true, chama o endpoint de conclusão."""
    try:
        client = _client()
        if complete:
            data = client.request("POST", f"/tasks/{task_id}/complete", tool="set_task_status")
        else:
            data = client.request(
                "PATCH",
                f"/tasks/{task_id}/status",
                json_body={"status": status},
                tool="set_task_status",
            )
        task = data.get("task") or data
        return _ok(compact_task(task) if isinstance(task, dict) else task)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def set_task_assignee(task_id: str, assignee_id: int) -> str:
    """Define o responsável da tarefa."""
    try:
        data = _client().request(
            "PATCH",
            f"/tasks/{task_id}/assignee",
            json_body={"assignee_id": assignee_id},
            tool="set_task_assignee",
        )
        task = data.get("task") or data
        return _ok(compact_task(task) if isinstance(task, dict) else task)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
def list_task_statuses() -> str:
    """Catálogo de status ativos de tarefa."""
    try:
        data = _client().request("GET", "/task-statuses", tool="list_task_statuses")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_assignees() -> str:
    """Diretório de usuários ativos para atribuição."""
    try:
        data = _client().request("GET", "/assignees", tool="list_assignees")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_boards(project_id: str | None = None) -> str:
    """Lista quadros acessíveis."""
    try:
        params = {"project_id": project_id} if project_id else None
        data = _client().request("GET", "/boards", params=params, tool="list_boards")
        boards = data.get("boards", data)
        return _ok({"boards": boards})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def get_board(board_id: str) -> str:
    """Detalhe do quadro e grupos."""
    try:
        client = _client()
        board = client.request("GET", f"/boards/{board_id}", tool="get_board")
        groups = client.request("GET", f"/boards/{board_id}/groups", tool="get_board")
        return _ok({"board": board.get("board", board), "groups": groups.get("groups", groups)})
    except Exception as exc:
        return _err(exc)


@mcp.tool
def time_start(task_id: str) -> str:
    """Inicia cronômetro na tarefa."""
    try:
        data = _client().request("POST", f"/tasks/{task_id}/time/start", tool="time_start")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def time_pause(task_id: str) -> str:
    """Pausa cronômetro ativo na tarefa."""
    try:
        data = _client().request("POST", f"/tasks/{task_id}/time/pause", tool="time_pause")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def time_resume(task_id: str) -> str:
    """Retoma cronômetro pausado na tarefa."""
    try:
        data = _client().request("POST", f"/tasks/{task_id}/time/resume", tool="time_resume")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def time_manual(task_id: str, minutes: int, note: str | None = None) -> str:
    """Lança tempo manual (minutos) na tarefa usando started_at/ended_at."""
    if minutes < 1:
        return _err(ValueError("minutes deve ser >= 1"))
    ended = datetime.now(timezone.utc)
    from datetime import timedelta

    started = ended - timedelta(minutes=minutes)
    body: dict[str, Any] = {
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "ended_at": ended.isoformat().replace("+00:00", "Z"),
    }
    if note:
        body["note"] = note
    try:
        data = _client().request(
            "POST",
            f"/tasks/{task_id}/time/manual",
            json_body=body,
            tool="time_manual",
        )
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_sprints() -> str:
    """Lista pastas de sprint / semana atual."""
    try:
        data = _client().request("GET", "/sprints", tool="list_sprints")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def get_sprint(sprint_id: str) -> str:
    """Detalhe da sprint com itens (compactos)."""
    try:
        data = _client().request("GET", f"/sprints/{sprint_id}", tool="get_sprint")
        week = data.get("week") or data
        items = week.get("items") if isinstance(week, dict) else None
        if isinstance(items, list):
            week = dict(week)
            week["items"] = [
                {
                    "id": item.get("id"),
                    "task_id": item.get("task_id"),
                    "title": item.get("title"),
                    "status": item.get("status"),
                    "priority": item.get("priority"),
                    "assignee_id": item.get("assignee_id") or (item.get("assignee") or {}).get("id"),
                    "assignee_name": item.get("assignee_name")
                    or (item.get("assignee") or {}).get("name"),
                    "start_date": item.get("start_date"),
                    "end_date": item.get("end_date"),
                    "always_in_sprint": item.get("always_in_sprint"),
                    "is_recurring": item.get("is_recurring"),
                }
                for item in items
            ]
            week["items_count"] = len(items)
        return _ok(week)
    except Exception as exc:
        return _err(exc)


# --- staff / ops v1.1 ---


@mcp.tool(annotations={"destructiveHint": True})
def generate_sprint(week_start: str | None = None, confirm: bool = False) -> str:
    """Regenera a lista da sprint (staff). Exige confirm=true."""
    if not confirm:
        return _ok(
            {
                "needs_confirm": True,
                "message": "Confirme com confirm=true para regenerar a sprint (substitui itens da pasta).",
                "week_start": week_start,
            },
        )
    body: dict[str, Any] = {}
    if week_start:
        body["week_start"] = week_start
    try:
        data = _client().request("POST", "/sprints/generate", json_body=body, tool="generate_sprint")
        return _ok(
            {
                "generated": data.get("generated"),
                "week": {
                    "id": (data.get("week") or {}).get("id"),
                    "week_start": (data.get("week") or {}).get("week_start"),
                    "week_end": (data.get("week") or {}).get("week_end"),
                    "label": (data.get("week") or {}).get("label"),
                    "items_count": len((data.get("week") or {}).get("items") or []),
                },
            },
        )
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"destructiveHint": True})
def lock_sprint(sprint_id: str, confirm: bool = False) -> str:
    """Trava a pasta da sprint (staff). Exige confirm=true."""
    if not confirm:
        return _ok({"needs_confirm": True, "sprint_id": sprint_id})
    try:
        data = _client().request("POST", f"/sprints/{sprint_id}/lock", tool="lock_sprint")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"destructiveHint": True})
def unlock_sprint(sprint_id: str, confirm: bool = False) -> str:
    """Destrava a pasta da sprint (staff). Exige confirm=true."""
    if not confirm:
        return _ok({"needs_confirm": True, "sprint_id": sprint_id})
    try:
        data = _client().request("POST", f"/sprints/{sprint_id}/unlock", tool="unlock_sprint")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def patch_sprint_item(
    sprint_id: str,
    item_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
    status: str | None = None,
    priority: str | None = None,
) -> str:
    """Atualiza item da sprint (staff) — datas/status/prioridade."""
    body: dict[str, Any] = {}
    if start_date is not None:
        body["start_date"] = start_date
    if end_date is not None:
        body["end_date"] = end_date
    if status is not None:
        body["status"] = status
    if priority is not None:
        body["priority"] = priority
    if not body:
        return _err(ValueError("Informe ao menos um campo."))
    try:
        data = _client().request(
            "PATCH",
            f"/sprints/{sprint_id}/items/{item_id}",
            json_body=body,
            tool="patch_sprint_item",
        )
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool
def add_task_comment(task_id: str, body: str) -> str:
    """Adiciona comentário em uma tarefa."""
    try:
        data = _client().request(
            "POST",
            f"/tasks/{task_id}/comments",
            json_body={"body": body},
            tool="add_task_comment",
        )
        return _ok(data)
    except Exception as exc:
        return _err(exc)


def run_stdio() -> None:
    mcp.run()


def run_http(host: str = "0.0.0.0", port: int = 8100) -> None:
    mcp.run(transport="http", host=host, port=port, stateless_http=True)


__all__ = ["mcp", "run_http", "run_stdio"]
