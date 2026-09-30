from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from datetime import timezone
from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from blackbeans_mcp.client import BlackBeansApiError
from blackbeans_mcp.client import BlackBeansClient
from blackbeans_mcp.client import comment_payload
from blackbeans_mcp.client import compact_task
from blackbeans_mcp.client import is_task_overdue
from blackbeans_mcp.client import nest_subtasks
from blackbeans_mcp.client import parse_entity_id
from blackbeans_mcp.client import project_url
from blackbeans_mcp.client import task_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

mcp = FastMCP(
    "BlackBeans",
    instructions=(
        "MCP do BlackBeans System. Autentique com Authorization: Bearer bb_pat_... "
        "(token gerado na Conta) ou BLACKBEANS_PAT no stdio. Use whoami para confirmar o acesso. "
        "Para localizar um cliente ou projeto: list_workspaces ou list_projects(search=<nome>) "
        "e depois get_project_overview(project_id). A busca ignora maiusculas e acentos e compara "
        "projeto, portfolio, workspace e cliente. "
        "IDs podem vir de links sistema.blackbeans.com.br/#task/<id> ou #project/<id>. "
        "O quadro e a coluna visual (pode puxar a tarefa via pull_status_keys). "
        "O status e o campo da tarefa e pode divergir do quadro; use status e status_label. "
        "Mutacoes sensiveis exigem confirm=true quando indicado. delete_task so funciona para staff/admin."
    ),
)


def _client() -> BlackBeansClient:
    return BlackBeansClient()


def _ok(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def _err(exc: Exception) -> str:
    if isinstance(exc, ToolError):
        raise exc
    if isinstance(exc, BlackBeansApiError):
        message = str(exc) or ("Nao encontrado." if exc.status_code == 404 else "Erro na API.")
        payload = {"error": message, "status_code": exc.status_code, "details": exc.payload}
    else:
        payload = {"error": str(exc)}
    raise ToolError(json.dumps(payload, ensure_ascii=False, default=str))


@mcp.tool(annotations={"readOnlyHint": True})
def whoami() -> str:
    """Retorna o usuario autenticado pelo PAT (perfil e papel)."""
    try:
        data = _client().request("GET", "/me", tool="whoami")
        return _ok(data)
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_my_tasks(
    status: str | None = None,
    priority: str | None = None,
    overdue: bool = False,
) -> str:
    """Lista tarefas atribuídas ao usuário autenticado. Use overdue=true para só atrasadas."""
    try:
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        if priority:
            params["priority"] = priority
        data = _client().request("GET", "/my-tasks", params=params, tool="list_my_tasks")
        tasks = [compact_task(row) for row in data.get("tasks", [])]
        if overdue:
            tasks = [row for row in tasks if is_task_overdue(row)]
        return _ok({"count": len(tasks), "overdue_only": overdue, "tasks": tasks})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def search_tasks(
    search: str | None = None,
    board_id: str | None = None,
    project_id: str | None = None,
    workspace_id: str | None = None,
    client: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    overdue: bool = False,
    due_before: str | None = None,
    due_after: str | None = None,
    roots_only: bool = True,
    include_subtasks: bool = False,
    limit: int = 50,
    cursor: str | None = None,
) -> str:
    """Busca tarefas visíveis. search cobre título, descrição, projeto, portfólio, workspace e cliente.

    O quadro é a coluna visual; status é o campo da tarefa (veja status_label).
    include_subtasks=true devolve as filhas aninhadas na tarefa-mãe.
    Paginação: limit (1-100, padrão 50) e cursor.
    """
    try:
        params: dict[str, Any] = {"limit": max(1, min(int(limit), 100))}
        if search:
            params["search"] = search
        if board_id:
            params["board_id"] = board_id
        if project_id:
            params["project_id"] = parse_entity_id(project_id, expected="project")
        if workspace_id:
            params["workspace_id"] = workspace_id
        if client:
            params["client"] = client
        if status:
            params["status"] = status
        if priority:
            params["priority"] = priority
        if assignee_id:
            params["assignee_id"] = assignee_id
        if overdue:
            params["overdue"] = "true"
        if due_before:
            params["due_before"] = due_before
        if due_after:
            params["due_after"] = due_after
        if cursor:
            params["cursor"] = cursor
        if include_subtasks or roots_only:
            params["roots_only"] = "true"
        data, meta = _client().request_with_meta("GET", "/tasks", params=params, tool="search_tasks")
        tasks = [compact_task(row) for row in data.get("tasks", [])]
        if include_subtasks and tasks:
            parent_ids = [str(row["id"]) for row in tasks if row.get("id")]
            if parent_ids:
                children_data = _client().request(
                    "GET",
                    "/tasks",
                    params={"parent_ids": ",".join(parent_ids)},
                    tool="search_tasks",
                )
                children = [compact_task(row) for row in children_data.get("tasks", [])]
                tasks = nest_subtasks(tasks + children)
        return _ok(
            {
                "count": len(tasks),
                "total": meta.get("total"),
                "limit": meta.get("limit", params["limit"]),
                "next_cursor": meta.get("next_cursor"),
                "tasks": tasks,
            },
        )
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def get_task(task_id: str) -> str:
    """Detalhe da tarefa: descrição, nomes, subtarefas, comentários, anexos, tempo e URL.

    Aceita o ID ou a URL #task/<id>.
    """
    try:
        task_uuid = parse_entity_id(task_id, expected="task")
        client = _client()
        data = client.request("GET", f"/tasks/{task_uuid}", tool="get_task")
        task = data.get("task") or data
        if not isinstance(task, dict) or not task.get("id"):
            raise BlackBeansApiError("Nao encontrado.", status_code=404)
        comments = client.request("GET", f"/tasks/{task_uuid}/comments", tool="get_task")
        attachments = client.request("GET", f"/tasks/{task_uuid}/attachments", tool="get_task")
        time_summary = client.request("GET", f"/tasks/{task_uuid}/time-summary", tool="get_task")
        subtasks = client.request("GET", "/tasks", params={"parent_id": task_uuid}, tool="get_task")
        detail = compact_task(task)
        detail["description"] = task.get("description") or ""
        detail["number"] = task.get("number")
        detail["comments"] = [
            {
                "id": row.get("id"),
                "author_name": row.get("author_name"),
                "content": row.get("content"),
                "created_at": row.get("created_at"),
            }
            for row in (comments.get("comments") or [])[:10]
        ]
        detail["attachments"] = [
            {"id": row.get("id"), "filename": row.get("filename"), "url": row.get("url")}
            for row in (attachments.get("attachments") or [])
        ]
        detail["time"] = {"total_seconds": (time_summary or {}).get("total_seconds")}
        detail["subtasks"] = [
            {
                "id": row.get("id"),
                "title": row.get("title"),
                "status": row.get("status"),
                "status_label": row.get("status_label"),
                "assignee_id": row.get("assignee_id"),
                "assignee_name": row.get("assignee_name"),
                "url": task_url(str(row["id"])) if row.get("id") else None,
            }
            for row in (subtasks.get("tasks") or [])
        ]
        return _ok(detail)
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


@mcp.tool(annotations={"destructiveHint": True})
def delete_task(task_id: str, confirm: bool = False) -> str:
    """Exclui uma tarefa. Exige confirm=true. Apenas staff/admin na API."""
    if not confirm:
        return _ok(
            {
                "needs_confirm": True,
                "task_id": task_id,
                "message": "Confirme com confirm=true para excluir a tarefa.",
            },
        )
    try:
        data = _client().request("DELETE", f"/tasks/{task_id}", tool="delete_task")
        return _ok(data)
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
    """Catálogo de status ativos, com rótulo em português (label) e ordem (position).

    O status da tarefa pode divergir do quadro em que ela está. O quadro é a coluna visual.
    """
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
def list_workspaces() -> str:
    """Lista áreas de trabalho com nome do cliente e quantidade de projetos ativos."""
    try:
        data = _client().request("GET", "/workspaces", tool="list_workspaces")
        workspaces = [
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "client_name": row.get("client_name"),
                "projects_count": row.get("projects_count"),
            }
            for row in (data.get("workspaces") or [])
        ]
        return _ok({"workspaces": workspaces})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_projects(workspace_id: str | None = None, search: str | None = None) -> str:
    """Lista projetos. search compara nome do projeto, portfólio, workspace e cliente, sem acento."""
    try:
        client = _client()
        params: dict[str, Any] = {}
        if workspace_id:
            params["workspace_id"] = workspace_id
        if search:
            params["search"] = search
        data = client.request("GET", "/projects", params=params or None, tool="list_projects")
        board_params: dict[str, Any] = {}
        if workspace_id:
            board_params["workspace_id"] = workspace_id
        boards_data = client.request("GET", "/boards", params=board_params or None, tool="list_projects")
        boards_by_project: dict[str, list[dict[str, Any]]] = {}
        for board in boards_data.get("boards") or []:
            boards_by_project.setdefault(str(board.get("project_id")), []).append(
                {"id": board.get("id"), "name": board.get("name")},
            )
        projects = []
        for project in data.get("projects") or []:
            project_id = str(project.get("id"))
            projects.append(
                {
                    "id": project_id,
                    "name": project.get("name"),
                    "workspace_id": project.get("workspace_id"),
                    "workspace_name": project.get("workspace_name"),
                    "portfolio_name": project.get("portfolio_name"),
                    "client_name": project.get("client_name"),
                    "status": project.get("status"),
                    "boards": boards_by_project.get(project_id, []),
                    "url": project_url(project_id),
                },
            )
        return _ok({"projects": projects})
    except Exception as exc:
        return _err(exc)


def _duplicate_titles(tasks: list[dict[str, Any]]) -> list[str]:
    counts: dict[str, int] = {}
    labels: dict[str, str] = {}
    for task in tasks:
        title = str(task.get("title") or "").strip()
        if not title:
            continue
        key = title.casefold()
        counts[key] = counts.get(key, 0) + 1
        labels[key] = title
    return sorted(labels[key] for key, total in counts.items() if total > 1)


@mcp.tool(annotations={"readOnlyHint": True})
def get_project_overview(project_id: str) -> str:
    """Uma chamada com o projeto, quadros, grupos, tarefas (subtarefas aninhadas) e resumo.

    Aceita o ID ou a URL #project/<id>. duplicate_titles lista títulos repetidos no projeto.
    """
    try:
        project_uuid = parse_entity_id(project_id, expected="project")
        client = _client()
        project_data = client.request("GET", f"/projects/{project_uuid}", tool="get_project_overview")
        project = project_data.get("project") or project_data
        if not isinstance(project, dict) or not project.get("id"):
            raise BlackBeansApiError("Nao encontrado.", status_code=404)
        boards_data = client.request(
            "GET",
            "/boards",
            params={"project_id": project_uuid},
            tool="get_project_overview",
        )
        boards = boards_data.get("boards") or []
        groups_by_board: dict[str, list[dict[str, Any]]] = {}
        for board in boards:
            board_id = str(board.get("id"))
            groups_data = client.request("GET", f"/boards/{board_id}/groups", tool="get_project_overview")
            groups_by_board[board_id] = groups_data.get("groups") or []
        tasks_data = client.request(
            "GET",
            "/tasks",
            params={"project_id": project_uuid},
            tool="get_project_overview",
        )
        statuses = client.request("GET", "/task-statuses", tool="get_project_overview")
        done_keys = {
            str(row.get("key"))
            for row in (statuses.get("statuses") or [])
            if row.get("is_done_like") and row.get("key")
        }
        done_keys.add("done")
        packed = [compact_task(row) for row in (tasks_data.get("tasks") or [])]
        children: dict[str, list[dict[str, Any]]] = {}
        roots: list[dict[str, Any]] = []
        known = {str(row.get("id")) for row in packed if row.get("id")}
        for row in packed:
            parent_id = row.get("parent_id")
            if parent_id and str(parent_id) in known:
                children.setdefault(str(parent_id), []).append(row)
            else:
                roots.append(row)

        def with_children(node: dict[str, Any]) -> dict[str, Any]:
            item = dict(node)
            item["subtasks"] = [with_children(child) for child in children.get(str(node.get("id")), [])]
            return item

        roots_by_group: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for row in roots:
            key = (str(row.get("board_id")), str(row.get("group_id")))
            roots_by_group.setdefault(key, []).append(with_children(row))

        done = sum(1 for row in packed if row.get("status") in done_keys)
        overdue = sum(1 for row in packed if row.get("status") not in done_keys and is_task_overdue(row))
        unassigned = sum(1 for row in packed if not row.get("assignee_id"))
        total = len(packed)
        board_payload = []
        for board in boards:
            board_id = str(board.get("id"))
            board_payload.append(
                {
                    "id": board_id,
                    "name": board.get("name"),
                    "task_counts": board.get("task_counts") or {},
                    "groups": [
                        {
                            "id": str(group.get("id")),
                            "name": group.get("name"),
                            "tasks": roots_by_group.get((board_id, str(group.get("id"))), []),
                        }
                        for group in groups_by_board.get(board_id, [])
                    ],
                },
            )
        return _ok(
            {
                "project": {
                    "id": project.get("id"),
                    "name": project.get("name"),
                    "status": project.get("status"),
                    "workspace_id": project.get("workspace_id"),
                    "workspace_name": project.get("workspace_name"),
                    "portfolio_name": project.get("portfolio_name"),
                    "client_name": project.get("client_name"),
                    "url": project_url(str(project.get("id"))),
                },
                "summary": {
                    "total": total,
                    "done": done,
                    "overdue": overdue,
                    "unassigned": unassigned,
                    "progress_percent": 0 if total == 0 else int((done * 100) / total),
                },
                "duplicate_titles": _duplicate_titles(packed),
                "boards": board_payload,
            },
        )
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def list_boards(
    project_id: str | None = None,
    workspace_id: str | None = None,
    search: str | None = None,
) -> str:
    """Lista quadros com nome do projeto, portfólio, workspace, cliente e contagem por status."""
    try:
        params: dict[str, Any] = {}
        if project_id:
            params["project_id"] = parse_entity_id(project_id, expected="project")
        if workspace_id:
            params["workspace_id"] = workspace_id
        if search:
            params["search"] = search
        data = _client().request("GET", "/boards", params=params or None, tool="list_boards")
        boards = data.get("boards", data)
        return _ok({"boards": boards})
    except Exception as exc:
        return _err(exc)


@mcp.tool(annotations={"readOnlyHint": True})
def get_board(board_id: str) -> str:
    """Detalhe do quadro, com nomes de projeto/workspace/cliente, contagens e grupos."""
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
    """Adiciona comentário em uma tarefa. Aceita o ID ou a URL #task/<id>."""
    try:
        task_uuid = parse_entity_id(task_id, expected="task")
        data = _client().request(
            "POST",
            f"/tasks/{task_uuid}/comments",
            json_body=comment_payload(body),
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
