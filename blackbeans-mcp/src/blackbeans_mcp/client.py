from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("blackbeans_mcp.audit")


class BlackBeansApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class BlackBeansClient:
    def __init__(self, *, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or os.environ.get("BLACKBEANS_API_URL") or "http://localhost:18000/api/v1").rstrip(
            "/",
        )
        self.token = token or os.environ.get("BLACKBEANS_PAT") or os.environ.get("BLACKBEANS_API_TOKEN") or ""
        if not self.token:
            raise BlackBeansApiError(
                "Defina BLACKBEANS_PAT (Personal Access Token bb_pat_...) no ambiente do MCP.",
            )

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
            logger.error("mcp.tool_call tool=%s outcome=error detail=%s", tool, exc)
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

        logger.info(
            "mcp.tool_call tool=%s outcome=ok status=%s args=%s",
            tool,
            response.status_code,
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
