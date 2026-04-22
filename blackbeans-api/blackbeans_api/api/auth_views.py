from __future__ import annotations

import logging
import secrets

import pyotp
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from blackbeans_api.api.auth_serializers import AdminTokenObtainPairSerializer
from blackbeans_api.api.auth_serializers import authenticate_admin_user
from blackbeans_api.api.mfa import consume_challenge_if_valid
from blackbeans_api.api.mfa import create_challenge
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.audit import log_audit_event

logger = logging.getLogger(__name__)


def infer_refresh_error_code(
    details: dict | list | str | None,
    raw_exception: Exception | None = None,
) -> str:
    serialized = str(details).lower()
    if raw_exception is not None:
        serialized = f"{serialized} {raw_exception!s}".lower()
    if "expired" in serialized or "expir" in serialized:
        return "token_expired"
    if "blacklist" in serialized or "blacklisted" in serialized:
        return "token_reused"
    return "token_not_valid"


class AdminTokenObtainPairView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        username = request.data.get("username")
        password = request.data.get("password")

        try:
            user = authenticate_admin_user(
                username=username,
                password=password,
                request=request,
            )
        except ValidationError as exc:
            log_audit_event(
                event_type="auth.login_failed",
                action="login",
                entity_type="auth",
                correlation_id=correlation_id,
                metadata={"username": username},
            )
            return error_response(
                correlation_id=correlation_id,
                code="invalid_credentials",
                message="Credenciais invalidas.",
                details=exc.detail,
            )

        if user.totp_enabled and user.totp_secret:
            challenge_payload = create_challenge(actor_id=str(user.id), method="totp")
            log_audit_event(
                event_type="auth.login_challenge_created",
                action="login",
                entity_type="auth",
                actor_id=user.id,
                correlation_id=correlation_id,
                metadata={"challenge_id": challenge_payload["challenge_id"], "method": "totp"},
            )
            logger.info(
                "auth.2fa.challenge_created actor_id=%s correlation_id=%s challenge_id=%s method=totp",
                user.id,
                correlation_id,
                challenge_payload["challenge_id"],
            )
            response = Response(
                {
                    "data": challenge_payload,
                    "meta": {},
                },
                status=status.HTTP_200_OK,
            )
            response["X-Correlation-ID"] = correlation_id
            return response

        token_payload = AdminTokenObtainPairSerializer.build_token_payload(user)
        log_audit_event(
            event_type="auth.login_success",
            action="login",
            entity_type="auth",
            actor_id=user.id,
            correlation_id=correlation_id,
            metadata={"totp_enabled": False},
        )
        response = Response(
            {
                "data": {
                    **token_payload,
                    "requires_2fa_setup": True,
                },
                "meta": {},
            },
            status=status.HTTP_200_OK,
        )
        response["X-Correlation-ID"] = correlation_id
        return response


class AdminToken2FAVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        challenge_id = request.data.get("challenge_id")
        code = str(request.data.get("code", ""))

        if not challenge_id or not code:
            return error_response(
                correlation_id=correlation_id,
                code="invalid_request",
                message="challenge_id e code sao obrigatorios.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        result = consume_challenge_if_valid(challenge_id=challenge_id, code=code)
        if not result.ok:
            if result.code == "too_many_attempts":
                logger.warning(
                    "auth.2fa.locked correlation_id=%s challenge_id=%s",
                    correlation_id,
                    challenge_id,
                )
                return error_response(
                    correlation_id=correlation_id,
                    code="too_many_attempts",
                    message="Challenge temporariamente bloqueado por tentativas invalidas.",
                    details={},
                    http_status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            if result.code == "invalid_2fa_code":
                log_audit_event(
                    event_type="auth.2fa_invalid_code",
                    action="verify_2fa",
                    entity_type="auth",
                    correlation_id=correlation_id,
                    metadata={"challenge_id": str(challenge_id)},
                )
                logger.warning(
                    "auth.2fa.invalid_code correlation_id=%s challenge_id=%s",
                    correlation_id,
                    challenge_id,
                )
                return error_response(
                    correlation_id=correlation_id,
                    code="invalid_2fa_code",
                    message="Codigo 2FA invalido.",
                    details={},
                )

            return error_response(
                correlation_id=correlation_id,
                code=result.code,
                message="Challenge invalido ou expirado.",
                details={},
            )

        token_payload = AdminTokenObtainPairSerializer.try_build_token_payload_from_actor_id(
            actor_id=result.actor_id
        )
        if token_payload is None:
            logger.warning(
                "auth.2fa.actor_missing correlation_id=%s challenge_id=%s actor_id=%s",
                correlation_id,
                challenge_id,
                result.actor_id,
            )
            return error_response(
                correlation_id=correlation_id,
                code="challenge_invalid_or_expired",
                message="Challenge invalido ou expirado.",
                details={},
            )
        logger.info(
            "auth.2fa.verified actor_id=%s correlation_id=%s",
            result.actor_id,
            correlation_id,
        )
        log_audit_event(
            event_type="auth.login_success",
            action="login",
            entity_type="auth",
            actor_id=int(result.actor_id),
            correlation_id=correlation_id,
        )
        response = Response(
            {
                "data": token_payload,
                "meta": {},
            },
            status=status.HTTP_200_OK,
        )
        response["X-Correlation-ID"] = correlation_id
        return response


class AdminTokenRefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        serializer = TokenRefreshSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except (ValidationError, InvalidToken, TokenError) as exc:
            details = exc.detail if hasattr(exc, "detail") else {}
            message = "Token de refresh invalido ou expirado."
            log_audit_event(
                event_type="auth.refresh_failed",
                action="refresh",
                entity_type="auth",
                correlation_id=correlation_id,
            )
            return error_response(
                correlation_id=correlation_id,
                code=infer_refresh_error_code(details, exc),
                message=message,
                details=details,
            )

        response = Response(
            {
                "data": {
                    "access_token": serializer.validated_data.get("access"),
                    "refresh_token": serializer.validated_data.get("refresh"),
                    "token_type": "Bearer",
                },
                "meta": {},
            },
            status=status.HTTP_200_OK,
        )
        response["X-Correlation-ID"] = correlation_id
        log_audit_event(
            event_type="auth.refresh_success",
            action="refresh",
            entity_type="auth",
            correlation_id=correlation_id,
        )
        return response


class Auth2FASettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        return success_response(
            correlation_id=correlation_id,
            data={
                "totp_enabled": bool(request.user.totp_enabled and request.user.totp_secret),
                "has_pending_enrollment": bool(request.user.totp_pending_secret),
                "recovery_codes_count": len(request.user.totp_recovery_codes or []),
            },
        )


class Auth2FAEnrollStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        user = request.user
        secret = pyotp.random_base32()
        user.totp_pending_secret = secret
        user.save(update_fields=["totp_pending_secret"])
        uri = pyotp.TOTP(secret).provisioning_uri(
            name=user.username,
            issuer_name="BlackBeans System",
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "secret": secret,
                "otpauth_uri": uri,
                "manual_entry_key": secret,
            },
        )


class Auth2FAEnrollConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        code = str(request.data.get("code", "")).strip()
        user = request.user
        if not user.totp_pending_secret:
            return error_response(
                correlation_id=correlation_id,
                code="totp_enrollment_not_started",
                message="Nenhum processo de ativacao 2FA foi iniciado.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if not pyotp.TOTP(user.totp_pending_secret).verify(code, valid_window=1):
            return error_response(
                correlation_id=correlation_id,
                code="invalid_2fa_code",
                message="Codigo 2FA invalido.",
                details={},
                http_status=status.HTTP_401_UNAUTHORIZED,
            )
        recovery_codes = [secrets.token_hex(4) for _ in range(8)]
        user.totp_secret = user.totp_pending_secret
        user.totp_pending_secret = ""
        user.totp_enabled = True
        user.totp_recovery_codes = recovery_codes
        user.save(
            update_fields=[
                "totp_secret",
                "totp_pending_secret",
                "totp_enabled",
                "totp_recovery_codes",
            ],
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "totp_enabled": True,
                "recovery_codes": recovery_codes,
            },
        )


class Auth2FADisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        correlation_id = get_correlation_id(request)
        code = str(request.data.get("code", "")).strip()
        user = request.user
        if not user.totp_enabled or not user.totp_secret:
            return error_response(
                correlation_id=correlation_id,
                code="totp_not_enabled",
                message="2FA nao esta habilitado para este usuario.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            recovery_codes = set(user.totp_recovery_codes or [])
            if code not in recovery_codes:
                return error_response(
                    correlation_id=correlation_id,
                    code="invalid_2fa_code",
                    message="Codigo 2FA invalido.",
                    details={},
                    http_status=status.HTTP_401_UNAUTHORIZED,
                )
            recovery_codes.remove(code)
            user.totp_recovery_codes = list(recovery_codes)
        user.totp_enabled = False
        user.totp_secret = ""
        user.totp_pending_secret = ""
        user.save(update_fields=["totp_enabled", "totp_secret", "totp_pending_secret", "totp_recovery_codes"])
        return success_response(
            correlation_id=correlation_id,
            data={"totp_enabled": False},
        )
