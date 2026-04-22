from __future__ import annotations

from uuid import uuid4

from rest_framework.request import Request


def get_correlation_id(request: Request) -> str:
    header_value = request.headers.get("X-Correlation-ID")
    return header_value if header_value else str(uuid4())
