from __future__ import annotations

import base64
import logging
import re
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from rest_framework import serializers
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.notification_service import get_frontend_base_url

logger = logging.getLogger(__name__)

User = get_user_model()

PASSWORD_RESET_MAX_AGE = 60 * 60 * 24  # 24h
PASSWORD_RESET_CACHE_PREFIX = "bb:pwdreset:"


def _email_enabled() -> bool:
    return bool(getattr(settings, "NOTIFICATION_EMAIL_ENABLED", True))


def build_password_reset_token(*, user) -> str:
    """Token opaco URL-safe (sem ':' / '$') armazenado no cache."""
    raw = secrets.token_urlsafe(32)
    cache.set(
        f"{PASSWORD_RESET_CACHE_PREFIX}{raw}",
        {"user_id": user.pk, "pwd": user.password},
        timeout=PASSWORD_RESET_MAX_AGE,
    )
    return raw


def parse_password_reset_token(token: str) -> dict | None:
    token = (token or "").strip()
    if not token:
        return None
    # Novo formato (cache)
    payload = cache.get(f"{PASSWORD_RESET_CACHE_PREFIX}{token}")
    if isinstance(payload, dict) and "user_id" in payload and "pwd" in payload:
        return payload
    # Compat: tokens antigos django.signing (base64url do dumps, ou dumps cru)
    try:
        from django.core import signing

        raw = token
        if ":" not in token:
            pad = "=" * (-len(token) % 4)
            raw = base64.urlsafe_b64decode(token + pad).decode("utf-8")
        data = signing.loads(raw, salt="bb-password-reset", max_age=PASSWORD_RESET_MAX_AGE)
        if isinstance(data, dict) and "user_id" in data and "pwd" in data:
            return data
    except Exception:  # noqa: BLE001
        return None
    return None


def consume_password_reset_token(token: str) -> None:
    token = (token or "").strip()
    if token:
        cache.delete(f"{PASSWORD_RESET_CACHE_PREFIX}{token}")


def _validate_new_password(value: str) -> str:
    if len(value) < 12:
        raise serializers.ValidationError("Senha deve ter ao menos 12 caracteres.")
    if not re.search(r"[A-Z]", value):
        raise serializers.ValidationError("Senha deve conter letra maiuscula.")
    if not re.search(r"[a-z]", value):
        raise serializers.ValidationError("Senha deve conter letra minuscula.")
    if not re.search(r"\d", value):
        raise serializers.ValidationError("Senha deve conter digito.")
    if not re.search(r"[^\w\s]", value):
        raise serializers.ValidationError("Senha deve conter caractere especial.")
    return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value: str) -> str:
        return _validate_new_password(value)


def _send_password_reset_email(*, user, token: str) -> None:
    if not _email_enabled():
        return
    recipient = str(user.email or "").strip()
    if not recipient:
        return
    base = get_frontend_base_url().rstrip("/")
    # Token URL-safe; query string estavel em clientes de e-mail
    reset_url = f"{base}/reset-password?token={token}"
    subject = "Redefinicao de senha — BlackBeans System"
    text_body = (
        f"Ola,\n\n"
        f"Recebemos um pedido para redefinir a senha da sua conta.\n"
        f"Use o link abaixo (valido por 24 horas):\n\n{reset_url}\n\n"
        f"Se voce nao solicitou, ignore este e-mail.\n"
    )
    html_body = (
        f"<p>Ola,</p>"
        f"<p>Recebemos um pedido para redefinir a senha da sua conta.</p>"
        f'<p><a href="{reset_url}">Redefinir senha</a></p>'
        f"<p>O link e valido por 24 horas. Se voce nao solicitou, ignore este e-mail.</p>"
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


class PasswordResetRequestView(APIView):
    """POST /auth/password-reset/request — sempre retorna sucesso (nao vaza usuarios)."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        user = (
            User.objects.filter(email__iexact=email, is_active=True)
            .order_by("-is_staff", "id")
            .first()
        )
        if user is not None and user.email:
            try:
                token = build_password_reset_token(user=user)
                _send_password_reset_email(user=user, token=token)
            except Exception:
                logger.exception(
                    "auth.password_reset.email_failed correlation_id=%s user_id=%s",
                    correlation_id,
                    user.pk,
                )

        return success_response(
            correlation_id=correlation_id,
            data={
                "requested": True,
                "message": "Se o e-mail existir, enviaremos instrucoes de redefinicao.",
            },
        )


class PasswordResetConfirmView(APIView):
    """POST /auth/password-reset/confirm — valida token e define nova senha."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]
        payload = parse_password_reset_token(token)
        if payload is None:
            return error_response(
                correlation_id=correlation_id,
                code="invalid_or_expired_token",
                message="Token invalido ou expirado.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(pk=payload["user_id"], is_active=True)
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="invalid_or_expired_token",
                message="Token invalido ou expirado.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        if user.password != payload.get("pwd"):
            return error_response(
                correlation_id=correlation_id,
                code="invalid_or_expired_token",
                message="Token invalido ou ja utilizado.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        consume_password_reset_token(token)
        logger.info(
            "auth.password_reset.confirmed user_id=%s correlation_id=%s",
            user.pk,
            correlation_id,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"changed": True},
        )
