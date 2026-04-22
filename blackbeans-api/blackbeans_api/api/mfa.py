from __future__ import annotations

import secrets
from datetime import timedelta
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.contrib.auth import get_user_model

import pyotp


def challenge_cache_key(challenge_id: str) -> str:
    return f"auth:2fa:challenge:{challenge_id}"


def consumed_cache_key(challenge_id: str) -> str:
    return f"auth:2fa:challenge:consumed:{challenge_id}"


def generate_2fa_code() -> str:
    static_code = getattr(settings, "AUTH_2FA_DEBUG_STATIC_CODE", "")
    if static_code and settings.DEBUG:
        return str(static_code)
    return f"{secrets.randbelow(1_000_000):06d}"


@dataclass
class ChallengeValidationResult:
    ok: bool
    code: str
    actor_id: str | None = None


def create_challenge(*, actor_id: str, method: str = "challenge") -> dict[str, Any]:
    challenge_id = str(uuid4())
    ttl_seconds = getattr(settings, "AUTH_2FA_CHALLENGE_TTL_SECONDS", 300)
    max_attempts = getattr(settings, "AUTH_2FA_MAX_ATTEMPTS", 5)
    code = generate_2fa_code() if method == "challenge" else ""

    cache.set(
        challenge_cache_key(challenge_id),
        {
            "actor_id": actor_id,
            "code": code,
            "attempts": 0,
            "max_attempts": max_attempts,
            "blocked_until": None,
            "method": method,
        },
        timeout=ttl_seconds,
    )
    return {
        "challenge_id": challenge_id,
        "status": "2fa_required",
        "method": method,
        "expires_in_seconds": ttl_seconds,
    }


def consume_challenge_if_valid(*, challenge_id: str, code: str) -> ChallengeValidationResult:
    key = challenge_cache_key(challenge_id)
    challenge_data = cache.get(key)

    if challenge_data is None:
        if cache.get(consumed_cache_key(challenge_id)):
            return ChallengeValidationResult(ok=False, code="challenge_consumed")
        return ChallengeValidationResult(ok=False, code="challenge_invalid_or_expired")

    blocked_until = challenge_data.get("blocked_until")
    now = timezone.now()
    if blocked_until and now < blocked_until:
        return ChallengeValidationResult(ok=False, code="too_many_attempts")

    method = str(challenge_data.get("method", "challenge"))
    expected_code = str(challenge_data.get("code", ""))
    is_valid = False
    if method == "totp":
        raw_actor = challenge_data.get("actor_id")
        if raw_actor:
            user_model = get_user_model()
            try:
                user = user_model.objects.get(pk=raw_actor)
                if user.totp_enabled and user.totp_secret:
                    is_valid = pyotp.TOTP(user.totp_secret).verify(code, valid_window=1)
            except user_model.DoesNotExist:
                is_valid = False
    else:
        is_valid = code == expected_code

    if not is_valid:
        challenge_data["attempts"] = int(challenge_data.get("attempts", 0)) + 1
        max_attempts = int(challenge_data.get("max_attempts", 5))
        if challenge_data["attempts"] >= max_attempts:
            lockout_seconds = getattr(settings, "AUTH_2FA_LOCKOUT_SECONDS", 900)
            challenge_data["blocked_until"] = now + timedelta(seconds=lockout_seconds)
            cache.set(key, challenge_data, timeout=lockout_seconds)
            return ChallengeValidationResult(ok=False, code="too_many_attempts")

        ttl_seconds = getattr(settings, "AUTH_2FA_CHALLENGE_TTL_SECONDS", 300)
        cache.set(key, challenge_data, timeout=ttl_seconds)
        return ChallengeValidationResult(ok=False, code="invalid_2fa_code")

    raw_actor = challenge_data.get("actor_id")
    if raw_actor is None or str(raw_actor).strip() == "":
        cache.delete(key)
        return ChallengeValidationResult(ok=False, code="challenge_invalid_or_expired")

    actor_id = str(raw_actor)
    ttl_seconds = getattr(settings, "AUTH_2FA_CHALLENGE_TTL_SECONDS", 300)
    cache.delete(key)
    cache.set(consumed_cache_key(challenge_id), True, timeout=ttl_seconds)
    return ChallengeValidationResult(ok=True, code="ok", actor_id=actor_id)
