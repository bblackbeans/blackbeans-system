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
            return payload["data"]
        return payload


def compact_task(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": task.get("id"),
        "title": task.get("title"),
        "status": task.get("status"),
        "priority": task.get("priority"),
        "assignee_id": task.get("assignee_id"),
        "board_id": task.get("board_id"),
        "group_id": task.get("group_id"),
        "start_date": task.get("start_date"),
        "end_date": task.get("end_date"),
        "effort_points": task.get("effort_points"),
        "is_recurring": task.get("is_recurring"),
        "always_in_sprint": task.get("always_in_sprint"),
        "project_name": task.get("project_name") or task.get("project"),
        "client_name": task.get("client_name") or task.get("client"),
    }


def is_task_overdue(task: dict[str, Any], *, now_ms: float | None = None) -> bool:
    if not task.get("end_date") or task.get("status") == "done":
        return False
    try:
        end = task["end_date"]
        # Support Z suffix
        from datetime import datetime
        from datetime import timezone

        parsed = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
        now = datetime.now(timezone.utc) if now_ms is None else datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)
        start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return parsed < start_today
    except Exception:
        return False
