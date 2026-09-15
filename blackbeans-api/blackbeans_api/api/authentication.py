"""Autenticacao por Personal Access Token (Bearer bb_pat_*)."""

from __future__ import annotations

import hashlib
import logging
from django.core.cache import cache
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication
from rest_framework.authentication import get_authorization_header

from blackbeans_api.users.models import UserApiToken

logger = logging.getLogger(__name__)

PAT_PREFIX = "bb_pat_"
PAT_RATE_LIMIT_PER_MINUTE = 120


def hash_api_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class PersonalAccessTokenAuthentication(BaseAuthentication):
    """Resolve Bearer bb_pat_* para o usuario dono do token."""

    keyword = b"bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword:
            return None
        if len(auth) != 2:
            return None
        try:
            raw = auth[1].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise exceptions.AuthenticationFailed("Token invalido.") from exc
        if not raw.startswith(PAT_PREFIX):
            return None

        token_hash = hash_api_token(raw)
        try:
            token = UserApiToken.objects.select_related("user").get(
                token_hash=token_hash,
                revoked_at__isnull=True,
            )
        except UserApiToken.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("Token invalido ou revogado.") from exc

        if token.expires_at and token.expires_at <= timezone.now():
            raise exceptions.AuthenticationFailed("Token expirado.")

        user = token.user
        if not user.is_active:
            raise exceptions.AuthenticationFailed("Usuario inativo.")

        self._enforce_rate_limit(token)
        UserApiToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        request.api_token = token  # type: ignore[attr-defined]
        return (user, token)

    def _enforce_rate_limit(self, token: UserApiToken) -> None:
        bucket = timezone.now().strftime("%Y%m%d%H%M")
        key = f"pat_rl:{token.pk}:{bucket}"
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=70)
            count = 1
        if count > PAT_RATE_LIMIT_PER_MINUTE:
            logger.warning("pat.rate_limited token_id=%s count=%s", token.pk, count)
            raise exceptions.Throttled(wait=60, detail="Limite de requisicoes do token excedido.")


def token_has_scope(auth, scope: str) -> bool:
    """JWT (auth nao e UserApiToken) passa; PAT precisa do scope."""
    if auth is None or not isinstance(auth, UserApiToken):
        return True
    scopes = auth.scopes or []
    return scope in scopes or "*" in scopes


def require_token_scope(request, scope: str) -> None:
    if not token_has_scope(getattr(request, "auth", None), scope):
        raise exceptions.PermissionDenied(f"Token sem escopo {scope}.")
