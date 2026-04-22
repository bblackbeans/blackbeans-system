from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response


def error_response(
    *,
    correlation_id: str,
    code: str,
    message: str,
    details: dict | list | str | None = None,
    http_status: int = status.HTTP_401_UNAUTHORIZED,
) -> Response:
    payload = {
        "error": {
            "code": code,
            "message": message,
            "details": details if details is not None else {},
        },
        "correlation_id": correlation_id,
    }
    response = Response(payload, status=http_status)
    response["X-Correlation-ID"] = correlation_id
    return response


def success_response(
    *,
    correlation_id: str,
    data: dict[str, Any] | list[Any],
    meta: dict[str, Any] | None = None,
    http_status: int = status.HTTP_200_OK,
) -> Response:
    response = Response(
        {
            "data": data,
            "meta": meta if meta is not None else {},
        },
        status=http_status,
    )
    response["X-Correlation-ID"] = correlation_id
    return response
