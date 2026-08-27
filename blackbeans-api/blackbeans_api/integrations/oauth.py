from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from blackbeans_api.integrations.client import RdAuthError
from blackbeans_api.integrations.client import RdCrmClient
from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.crypto import decrypt_secret
from blackbeans_api.integrations.crypto import encrypt_secret
from blackbeans_api.integrations.models import IntegrationCredential
from blackbeans_api.integrations.models import IntegrationOAuthState
from blackbeans_api.integrations.models import IntegrationSettings
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import default_legal_bases

logger = logging.getLogger(__name__)

AUTH_DIALOG = "https://accounts.rdstation.com/oauth/authorize"
TOKEN_URL = "https://api.rd.services/oauth2/token"  # noqa: S105
PROVIDER = Provider.RD_STATION_CRM
STATE_TTL = timedelta(minutes=10)
ACCESS_SKEW = timedelta(seconds=60)


def oauth_configured() -> bool:
    return bool(
        settings.RDSTATION_CRM_CLIENT_ID and settings.RDSTATION_CRM_CLIENT_SECRET,
    )


def redirect_uri() -> str:
    configured = (settings.RDSTATION_CRM_REDIRECT_URI or "").strip()
    if configured:
        return configured
    base = (settings.API_PUBLIC_BASE_URL or settings.FRONTEND_BASE_URL or "").rstrip(
        "/",
    )
    return f"{base}/api/v1/integrations/rdstation/oauth/callback"


def webhook_url() -> str:
    configured = (settings.RDSTATION_CRM_WEBHOOK_URL or "").strip()
    if configured:
        return configured
    base = (settings.API_PUBLIC_BASE_URL or settings.FRONTEND_BASE_URL or "").rstrip(
        "/",
    )
    return f"{base}/api/v1/integrations/rdstation/webhook"


def get_settings() -> IntegrationSettings:
    obj, created = IntegrationSettings.objects.get_or_create(
        provider=PROVIDER,
        defaults={"legal_bases": default_legal_bases()},
    )
    if created and not obj.webhook_secret:
        obj.webhook_secret = secrets.token_urlsafe(32)
        obj.save(update_fields=["webhook_secret"])
    return obj


def get_credential() -> IntegrationCredential | None:
    return IntegrationCredential.objects.filter(provider=PROVIDER).first()


def is_connected() -> bool:
    cred = get_credential()
    return bool(cred and cred.refresh_token_encrypted)


def build_authorization_url(*, user) -> str:
    if not oauth_configured():
        msg = "RDSTATION_CRM_CLIENT_ID/SECRET nao configurados."
        raise RdAuthError(msg, status_code=503)
    state = secrets.token_urlsafe(24)
    IntegrationOAuthState.objects.create(
        provider=PROVIDER,
        state=state,
        created_by=user if getattr(user, "is_authenticated", False) else None,
        expires_at=timezone.now() + STATE_TTL,
    )
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.RDSTATION_CRM_CLIENT_ID,
            "redirect_uri": redirect_uri(),
            "state": state,
        },
    )
    return f"{AUTH_DIALOG}?{query}"


def _token_payload(payload: dict) -> dict:
    nested = payload.get("data")
    if isinstance(nested, dict) and nested.get("access_token"):
        return nested
    return payload


def _store_tokens(payload: dict, *, user=None) -> IntegrationCredential:
    payload = _token_payload(payload)
    access = payload.get("access_token") or ""
    refresh = payload.get("refresh_token") or ""
    if not access or not refresh:
        msg = "Resposta OAuth sem access_token/refresh_token."
        raise RdAuthError(msg, status_code=502)
    expires_in = int(payload.get("expires_in") or 7200)
    expires_at = timezone.now() + timedelta(seconds=max(expires_in - 30, 60))
    cred, _ = IntegrationCredential.objects.update_or_create(
        provider=PROVIDER,
        defaults={
            "access_token_encrypted": encrypt_secret(access),
            "refresh_token_encrypted": encrypt_secret(refresh),
            "access_expires_at": expires_at,
            "connected_at": timezone.now(),
            "connected_by": user,
        },
    )
    cfg = get_settings()
    if not cfg.webhook_secret:
        cfg.webhook_secret = secrets.token_urlsafe(32)
        cfg.save(update_fields=["webhook_secret"])
    logger.info("rd.oauth tokens stored provider=%s", PROVIDER)
    return cred


def exchange_code(code: str, state: str, *, transport=None):
    row = IntegrationOAuthState.objects.filter(provider=PROVIDER, state=state).first()
    if row is None or row.expires_at < timezone.now():
        msg = "State OAuth invalido ou expirado."
        raise RdAuthError(msg, status_code=400)
    user = row.created_by
    row.delete()
    client = RdCrmClient(transport=transport, timeout=20)
    payload = client.request(
        "POST",
        TOKEN_URL,
        payload={
            "client_id": settings.RDSTATION_CRM_CLIENT_ID,
            "client_secret": settings.RDSTATION_CRM_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
        },
        authenticated=False,
        retry_auth=False,
        as_form=True,
        base_url="",
    )
    return _store_tokens(payload if isinstance(payload, dict) else {}, user=user)


def refresh_access_token(*, transport=None) -> str:
    with transaction.atomic():
        cred = (
            IntegrationCredential.objects.select_for_update()
            .filter(provider=PROVIDER)
            .first()
        )
        if cred is None or not cred.refresh_token_encrypted:
            msg = "RD Station CRM nao conectado."
            raise RdAuthError(msg, status_code=401)
        now = timezone.now()
        if cred.access_expires_at and cred.access_expires_at - ACCESS_SKEW > now:
            return decrypt_secret(cred.access_token_encrypted)
        refresh = decrypt_secret(cred.refresh_token_encrypted)
        client = RdCrmClient(transport=transport, timeout=20)
        try:
            payload = client.request(
                "POST",
                TOKEN_URL,
                payload={
                    "client_id": settings.RDSTATION_CRM_CLIENT_ID,
                    "client_secret": settings.RDSTATION_CRM_CLIENT_SECRET,
                    "refresh_token": refresh,
                    "grant_type": "refresh_token",
                },
                authenticated=False,
                retry_auth=False,
                as_form=True,
                base_url="",
            )
        except RdHttpError as exc:
            raise RdAuthError(str(exc), status_code=exc.status_code) from exc
        payload = _token_payload(payload if isinstance(payload, dict) else {})
        access = payload.get("access_token") or ""
        new_refresh = payload.get("refresh_token") or refresh
        if not access:
            msg = "Falha ao renovar access_token."
            raise RdAuthError(msg, status_code=502)
        expires_in = int(payload.get("expires_in") or 7200)
        cred.access_token_encrypted = encrypt_secret(access)
        cred.refresh_token_encrypted = encrypt_secret(new_refresh)
        cred.access_expires_at = now + timedelta(seconds=max(expires_in - 30, 60))
        cred.save(
            update_fields=[
                "access_token_encrypted",
                "refresh_token_encrypted",
                "access_expires_at",
                "updated_at",
            ],
        )
        logger.info("rd.oauth refresh rotated provider=%s", PROVIDER)
        return access


def get_access_token(*, transport=None) -> str:
    cred = get_credential()
    if cred is None or not cred.access_token_encrypted:
        msg = "RD Station CRM nao conectado."
        raise RdAuthError(msg, status_code=401)
    now = timezone.now()
    if cred.access_expires_at and cred.access_expires_at - ACCESS_SKEW > now:
        return decrypt_secret(cred.access_token_encrypted)
    return refresh_access_token(transport=transport)


def connected_client(*, transport=None, max_retry_after: float = 8) -> RdCrmClient:
    return RdCrmClient(
        transport=transport,
        token_provider=lambda: get_access_token(transport=transport),
        refresher=lambda: refresh_access_token(transport=transport),
        max_retry_after=max_retry_after,
    )


def disconnect() -> None:
    IntegrationCredential.objects.filter(provider=PROVIDER).delete()
    IntegrationOAuthState.objects.filter(provider=PROVIDER).delete()
    IntegrationSettings.objects.filter(provider=PROVIDER).update(
        webhook_registered=False,
    )
    logger.info("rd.oauth disconnected provider=%s", PROVIDER)


def frontend_redirect(status: str) -> str:
    base = (settings.FRONTEND_BASE_URL or "/").rstrip("/")
    return f"{base}/?rd={status}#leads"
