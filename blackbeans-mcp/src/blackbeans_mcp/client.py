from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger("blackbeans_mcp.audit")

_BEARER_RE = re.compile(r"^\s*Bearer\s+(\S+)\s*$", re.IGNORECASE)


class BlackBeansApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


def token_prefix(raw: str) -> str:
    if not raw:
        return ""
    return raw[:16] + ("…" if len(raw) > 16 else "")


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    match = _BEARER_RE.match(authorization)
    if not match:
        return None
    token = match.group(1).strip()
    return token or None


def resolve_pat_from_http_headers() -> str | None:
    """Lê Authorization do request MCP HTTP atual (multi-user)."""
    try:
        from fastmcp.server.dependencies import get_http_headers
    except Exception:
        return None
    headers = get_http_headers(include={"authorization"})
    # headers keys may be lowercased
    auth = headers.get("authorization") or headers.get("Authorization")
    token = extract_bearer_token(auth)
    if token and token.startswith("bb_pat_"):
        return token
    if token:
        # Aceita Bearer genérico também (JWT legado), mas preferimos bb_pat_
        return token
    return None


def resolve_access_token() -> str:
    """
    Ordem:
    1) Header Authorization do cliente MCP (HTTP hospedado)
    2) BLACKBEANS_PAT / BLACKBEANS_API_TOKEN (stdio local)
    """
    header_token = resolve_pat_from_http_headers()
    if header_token:
        return header_token
    env_token = (os.environ.get("BLACKBEANS_PAT") or os.environ.get("BLACKBEANS_API_TOKEN") or "").strip()
    if env_token:
        return env_token
    raise BlackBeansApiError(
        "Autenticacao necessaria. Envie Authorization: Bearer bb_pat_... no cliente MCP "
        "(Cursor/Claude) ou defina BLACKBEANS_PAT no ambiente (stdio local).",
    )


class BlackBeansClient:
    def __init__(self, *, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or os.environ.get("BLACKBEANS_API_URL") or "http://localhost:18000/api/v1").rstrip(
            "/",
        )
        self.token = (token or "").strip() or resolve_access_token()
        self.token_prefix = token_prefix(self.token)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        tool: str = "",
    ) -> Any:
        data, _meta = self.request_with_meta(method, path, params=params, json_body=json_body, tool=tool)
        return data

    def request_with_meta(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        tool: str = "",
    ) -> tuple[Any, dict[str, Any]]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        safe_args = {
            "method": method,
            "path": path,
            "params": params or {},
            "body_keys": sorted((json_body or {}).keys()),
            "pat_prefix": self.token_prefix,
        }
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.request(
                    method,
                    url,
                    headers=self._headers(),
                    params=params,
                    json=json_body,
                )
        except httpx.HTTPError as exc:
            logger.error(
                "mcp.tool_call tool=%s outcome=error pat_prefix=%s detail=%s",
                tool,
                self.token_prefix,
                exc,
            )
            raise BlackBeansApiError(f"Falha de rede ao chamar a API: {exc}") from exc

        try:
            payload = response.json()
        except Exception:
            payload = {"raw": response.text[:500]}

        if response.status_code >= 400:
            message = None
            if isinstance(payload, dict):
                err = payload.get("error") or {}
                if isinstance(err, dict):
                    message = err.get("message")
                message = message or payload.get("detail") or payload.get("message")
            logger.warning(
                "mcp.tool_call tool=%s outcome=http_error status=%s args=%s",
                tool,
                response.status_code,
                json.dumps(safe_args, ensure_ascii=False),
            )
            raise BlackBeansApiError(
                message or f"API retornou HTTP {response.status_code}",
                status_code=response.status_code,
                payload=payload,
            )

        user_hint = ""
        if isinstance(payload, dict):
            data = payload.get("data") if "data" in payload else payload
            if isinstance(data, dict):
                user = data.get("user")
                if isinstance(user, dict) and user.get("id") is not None:
                    user_hint = f" user_id={user.get('id')} username={user.get('username')}"

        logger.info(
            "mcp.tool_call tool=%s outcome=ok status=%s%s args=%s",
            tool,
            response.status_code,
            user_hint,
            json.dumps(safe_args, ensure_ascii=False),
        )
        if isinstance(payload, dict) and "data" in payload:
            data = payload["data"]
        else:
            data = payload
        meta = payload.get("meta") if isinstance(payload, dict) and isinstance(payload.get("meta"), dict) else {}
        return data, meta


def app_base_url() -> str:
    return (os.environ.get("BLACKBEANS_APP_URL") or "https://sistema.blackbeans.com.br").rstrip("/")


def task_url(task_id: str) -> str:
    return f"{app_base_url()}/#task/{task_id}"


def project_url(project_id: str) -> str:
    return f"{app_base_url()}/#project/{project_id}"


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_TASK_HASH_RE = re.compile(r"#task/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.IGNORECASE)
_PROJECT_HASH_RE = re.compile(
    r"#project/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


def parse_entity_id(value: str, *, expected: str) -> str:
    """Aceita UUID puro ou URL do sistema (#task/ ou #project/)."""
    raw = (value or "").strip()
    task_match = _TASK_HASH_RE.search(raw)
    project_match = _PROJECT_HASH_RE.search(raw)
    if expected == "task" and project_match and not task_match:
        raise BlackBeansApiError("A URL e de um projeto. Use get_project_overview.")
    if expected == "project" and task_match and not project_match:
        raise BlackBeansApiError("A URL e de uma tarefa. Use get_task.")
    if expected == "task" and task_match:
        return task_match.group(1)
    if expected == "project" and project_match:
        return project_match.group(1)
    if _UUID_RE.match(raw):
        return raw
    raise BlackBeansApiError(
        "Nao encontrado. Informe o ID ou a URL completa (#task/<id> ou #project/<id>).",
    )


def comment_payload(body: str) -> dict[str, str]:
    return {"content": body}


def compact_task(task: dict[str, Any]) -> dict[str, Any]:
    task_id = task.get("id")
    payload = {
        "id": task_id,
        "title": task.get("title"),
        "status": task.get("status"),
        "status_label": task.get("status_label"),
        "priority": task.get("priority"),
        "assignee_id": task.get("assignee_id"),
        "assignee_name": task.get("assignee_name"),
        "board_id": task.get("board_id"),
        "group_id": task.get("group_id"),
        "group_name": task.get("group_name"),
        "parent_id": task.get("parent_id"),
        "parent_title": task.get("parent_title"),
        "subtasks_count": task.get("subtasks_count"),
        "start_date": task.get("start_date"),
        "end_date": task.get("end_date"),
        "effort_points": task.get("effort_points"),
        "is_recurring": task.get("is_recurring"),
        "always_in_sprint": task.get("always_in_sprint"),
        "project_id": task.get("project_id"),
        "project_name": task.get("project_name"),
        "portfolio_name": task.get("portfolio_name"),
        "workspace_id": task.get("workspace_id"),
        "workspace_name": task.get("workspace_name"),
        "client_name": task.get("client_name"),
    }
    if task_id:
        payload["url"] = task_url(str(task_id))
    return payload


def nest_subtasks(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa subtarefas dentro da tarefa-mãe. Itens órfãos permanecem na lista."""
    children: dict[str, list[dict[str, Any]]] = {}
    roots: list[dict[str, Any]] = []
    known_ids = {str(task.get("id")) for task in tasks if task.get("id")}
    for task in tasks:
        parent_id = task.get("parent_id")
        if parent_id and str(parent_id) in known_ids:
            children.setdefault(str(parent_id), []).append(task)
        else:
            roots.append(task)

    def attach(node: dict[str, Any]) -> dict[str, Any]:
        packed = dict(node)
        packed["subtasks"] = [attach(child) for child in children.get(str(node.get("id")), [])]
        return packed

    return [attach(root) for root in roots]


def is_task_overdue(task: dict[str, Any], *, now_ms: float | None = None) -> bool:
    if not task.get("end_date") or task.get("status") == "done":
        return False
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo

        parsed = datetime.fromisoformat(str(task["end_date"]).replace("Z", "+00:00"))
        zone = ZoneInfo("America/Sao_Paulo")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=zone)
        if now_ms is None:
            now = datetime.now(zone)
        else:
            now = datetime.fromtimestamp(now_ms / 1000, tz=zone)
        start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return parsed < start_today
    except Exception:
        return False
