from __future__ import annotations

import json
import logging
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

CRM_BASE = "https://api.rd.services/crm/v2"
ALLOWED_HOSTS = {"api.rd.services"}
DEFAULT_TIMEOUT = 20
HTTP_BAD_REQUEST = 400
HTTP_UNAUTHORIZED = 401
HTTP_TOO_MANY_REQUESTS = 429
HTTP_SERVER_ERROR = 500
MAX_RATE_ATTEMPTS = 4
MAX_SERVER_ATTEMPTS = 3

Transport = Callable[
    [str, str, dict[str, str], bytes | None, int], tuple[int, Any, dict[str, str]],
]


class RdHttpError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        retryable: bool = False,
        retry_after: float | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable
        self.retry_after = retry_after


class RdAuthError(RdHttpError):
    pass


def _header_map(headers) -> dict[str, str]:
    if headers is None:
        return {}
    if hasattr(headers, "items"):
        return {str(k).lower(): str(v) for k, v in headers.items()}
    return {}


def urllib_transport(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout: int,
) -> tuple[int, Any, dict[str, str]]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        msg = "Host HTTP nao permitido."
        raise RdHttpError(msg, status_code=0)
    request = urllib.request.Request(  # noqa: S310
        url,
        data=body,
        method=method,
        headers=headers,
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(  # noqa: S310
            request, timeout=timeout, context=context,
        ) as response:
            raw = response.read()
            payload = json.loads(raw.decode()) if raw else {}
            return int(response.status), payload, _header_map(response.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read() if exc.fp else b""
        try:
            payload = json.loads(raw.decode()) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw.decode(errors="replace")[:300]}
        return int(exc.code), payload, _header_map(exc.headers)


def _safe_path(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return parsed.path or "/"


class RdCrmClient:
    def __init__(  # noqa: PLR0913
        self,
        *,
        transport: Transport | None = None,
        access_token: str = "",
        token_provider: Callable[[], str] | None = None,
        refresher: Callable[[], str] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retry_after: float = 8,
    ):
        self.transport = transport or urllib_transport
        self._access_token = access_token
        self.token_provider = token_provider
        self.refresher = refresher
        self.timeout = timeout
        self.max_retry_after = max_retry_after

    def _token(self) -> str:
        if self.token_provider:
            return self.token_provider()
        return self._access_token

    def request(  # noqa: C901, PLR0912, PLR0913
        self,
        method: str,
        path: str,
        *,
        payload: dict | None = None,
        query: dict[str, str] | None = None,
        authenticated: bool = True,
        extra_headers: dict[str, str] | None = None,
        base_url: str = CRM_BASE,
        retry_auth: bool = True,
        as_form: bool = False,
    ) -> Any:
        url = (
            path
            if path.startswith("http")
            else f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        )
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        headers = {"Accept": "application/json"}
        body = None
        if payload is not None:
            if as_form:
                headers["Content-Type"] = "application/x-www-form-urlencoded"
                body = urllib.parse.urlencode(payload).encode()
            else:
                headers["Content-Type"] = "application/json"
                body = json.dumps(payload).encode()
        if extra_headers:
            headers.update(extra_headers)
        if authenticated:
            token = self._token()
            if not token:
                msg = "RD Station CRM nao conectado."
                raise RdAuthError(msg, status_code=HTTP_UNAUTHORIZED)
            headers["Authorization"] = f"Bearer {token}"
        attempts = 0
        refreshed = False
        while True:
            attempts += 1
            status, data, response_headers = self.transport(
                method.upper(),
                url,
                headers,
                body,
                self.timeout,
            )
            logger.info(
                "rd.http method=%s path=%s status=%s",
                method.upper(),
                _safe_path(url),
                status,
            )
            if (
                status == HTTP_UNAUTHORIZED
                and retry_auth
                and not refreshed
                and authenticated
                and self.refresher
            ):
                new_token = self.refresher()
                headers["Authorization"] = f"Bearer {new_token}"
                refreshed = True
                continue
            if status == HTTP_TOO_MANY_REQUESTS and attempts < MAX_RATE_ATTEMPTS:
                retry_after = response_headers.get(
                    "retry-after",
                ) or response_headers.get("Retry-After")
                try:
                    wait = min(float(retry_after or "1"), self.max_retry_after)
                except ValueError:
                    wait = 1.0
                time.sleep(max(wait, 0.2))
                continue
            if status >= HTTP_SERVER_ERROR and attempts < MAX_SERVER_ATTEMPTS:
                time.sleep(min(2**attempts, self.max_retry_after))
                continue
            if status >= HTTP_BAD_REQUEST:
                message = _error_message(data, status)
                retryable = (
                    status >= HTTP_SERVER_ERROR or status == HTTP_TOO_MANY_REQUESTS
                )
                raise RdHttpError(
                    message,
                    status_code=status,
                    retryable=retryable,
                    retry_after=None,
                )
            return data

    def get(self, path: str, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path: str, payload: dict | None = None, **kwargs):
        return self.request("POST", path, payload=payload, **kwargs)

    def put(self, path: str, payload: dict | None = None, **kwargs):
        return self.request("PUT", path, payload=payload, **kwargs)

    def delete(self, path: str, **kwargs):
        return self.request("DELETE", path, **kwargs)


def _error_message(data: Any, status: int) -> str:
    if isinstance(data, dict):
        err = data.get("errors") or data.get("error") or data.get("message")
        if isinstance(err, str) and err:
            return err[:500]
        if isinstance(err, list):
            parts = []
            for item in err:
                if isinstance(item, str) and item:
                    parts.append(item)
                elif isinstance(item, dict):
                    parts.append(
                        str(
                            item.get("detail")
                            or item.get("title")
                            or item.get("message")
                            or item,
                        ),
                    )
            if parts:
                return "; ".join(parts)[:500]
        if isinstance(err, dict):
            return str(err)[:500]
    return f"RD Station CRM HTTP {status}"


def unwrap_data(payload: Any) -> Any:
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


def as_list(payload: Any) -> list[dict]:
    data = unwrap_data(payload)
    if data is None:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        return [data]
    return []
