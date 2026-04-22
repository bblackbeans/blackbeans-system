from __future__ import annotations

from uuid import uuid4

from rest_framework.exceptions import AuthenticationFailed
from rest_framework.exceptions import NotAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.views import exception_handler as drf_exception_handler

from blackbeans_api.api.responses import error_response
from blackbeans_api.api.utils import get_correlation_id


def custom_exception_handler(exc, context):
    request = context.get("request")
    correlation_id = get_correlation_id(request) if request is not None else str(uuid4())

    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return error_response(
            correlation_id=correlation_id,
            code="not_authenticated",
            message="Autenticacao necessaria.",
            details=getattr(exc, "detail", {}),
            http_status=401,
        )
    if isinstance(exc, PermissionDenied):
        return error_response(
            correlation_id=correlation_id,
            code="forbidden",
            message="Acesso negado.",
            details=getattr(exc, "detail", {}),
            http_status=403,
        )
    if isinstance(exc, DRFValidationError):
        return error_response(
            correlation_id=correlation_id,
            code="validation_error",
            message="Dados invalidos.",
            details=exc.detail,
            http_status=400,
        )

    return drf_exception_handler(exc, context)
