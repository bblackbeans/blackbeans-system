"""Endpoints /me/api-tokens para Personal Access Tokens."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.authentication import PAT_PREFIX
from blackbeans_api.api.authentication import hash_api_token
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.audit import log_audit_event
from blackbeans_api.users.models import API_TOKEN_SCOPES
from blackbeans_api.users.models import DEFAULT_API_TOKEN_SCOPES
from blackbeans_api.users.models import UserApiToken


def _iso(value):
    if not value:
        return None
    return value.isoformat().replace("+00:00", "Z")


def token_to_representation(token: UserApiToken) -> dict:
    return {
        "id": str(token.pk),
        "name": token.name,
        "token_prefix": token.token_prefix,
        "scopes": list(token.scopes or []),
        "expires_at": _iso(token.expires_at),
        "revoked_at": _iso(token.revoked_at),
        "last_used_at": _iso(token.last_used_at),
        "created_at": _iso(token.created_at),
        "is_active": token.is_active,
    }


def _generate_raw_token() -> tuple[str, str, str]:
    raw = f"{PAT_PREFIX}{secrets.token_urlsafe(32)}"
    return raw, hash_api_token(raw), raw[:16]


class MeApiTokenListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        tokens = UserApiToken.objects.filter(user=request.user).order_by("-created_at")
        return success_response(
            correlation_id=correlation_id,
            data={"tokens": [token_to_representation(row) for row in tokens]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        name = str(request.data.get("name") or "").strip()
        if not name:
            return error_response(
                correlation_id=correlation_id,
                code="name_required",
                message="Informe um nome para o token.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        raw_scopes = request.data.get("scopes")
        if raw_scopes is None:
            scopes = list(DEFAULT_API_TOKEN_SCOPES)
        elif isinstance(raw_scopes, list):
            scopes = [str(item).strip() for item in raw_scopes if str(item).strip()]
        else:
            return error_response(
                correlation_id=correlation_id,
                code="scopes_invalid",
                message="scopes deve ser uma lista.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        invalid = [scope for scope in scopes if scope not in API_TOKEN_SCOPES]
        if invalid:
            return error_response(
                correlation_id=correlation_id,
                code="scopes_invalid",
                message="Escopo(s) invalido(s).",
                details={"invalid": invalid},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        if "sprints:write" in scopes and not (
            getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False)
        ):
            return error_response(
                correlation_id=correlation_id,
                code="scopes_forbidden",
                message="Apenas staff pode criar token com sprints:write.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )

        expires_at = None
        expires_raw = request.data.get("expires_at")
        expires_days = request.data.get("expires_in_days")
        if expires_raw:
            expires_at = parse_datetime(str(expires_raw))
            if expires_at is None:
                return error_response(
                    correlation_id=correlation_id,
                    code="expires_invalid",
                    message="expires_at invalido.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            if timezone.is_naive(expires_at):
                expires_at = timezone.make_aware(expires_at, timezone.get_current_timezone())
        elif expires_days is not None:
            try:
                days = int(expires_days)
            except (TypeError, ValueError):
                return error_response(
                    correlation_id=correlation_id,
                    code="expires_invalid",
                    message="expires_in_days invalido.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            if days < 1 or days > 365:
                return error_response(
                    correlation_id=correlation_id,
                    code="expires_invalid",
                    message="expires_in_days deve estar entre 1 e 365.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            expires_at = timezone.now() + timedelta(days=days)

        raw, token_hash, prefix = _generate_raw_token()
        token = UserApiToken.objects.create(
            user=request.user,
            name=name[:120],
            token_prefix=prefix,
            token_hash=token_hash,
            scopes=scopes,
            expires_at=expires_at,
        )
        log_audit_event(
            event_type="auth.api_token_created",
            action="create",
            entity_type="user_api_token",
            entity_id=str(token.pk),
            actor_id=request.user.pk,
            correlation_id=correlation_id,
            after={"name": token.name, "scopes": scopes, "token_prefix": prefix},
        )
        payload = token_to_representation(token)
        payload["token"] = raw
        return success_response(
            correlation_id=correlation_id,
            data={"token": payload},
            http_status=status.HTTP_201_CREATED,
        )


class MeApiTokenDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, token_id):
        correlation_id = get_correlation_id(request)
        try:
            token = UserApiToken.objects.get(pk=token_id, user=request.user)
        except UserApiToken.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="token_not_found",
                message="Token nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if token.revoked_at is None:
            token.revoked_at = timezone.now()
            token.save(update_fields=["revoked_at"])
            log_audit_event(
                event_type="auth.api_token_revoked",
                action="revoke",
                entity_type="user_api_token",
                entity_id=str(token.pk),
                actor_id=request.user.pk,
                correlation_id=correlation_id,
                after={"name": token.name, "token_prefix": token.token_prefix},
            )
        return success_response(
            correlation_id=correlation_id,
            data={"revoked": True, "token": token_to_representation(token)},
        )
