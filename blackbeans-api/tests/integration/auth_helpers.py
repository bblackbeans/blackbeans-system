from __future__ import annotations

from django.core.cache import cache
from rest_framework.test import APIClient

from blackbeans_api.api.mfa import challenge_cache_key


def obtain_admin_access_token(client: APIClient, username: str, password: str) -> str:
    """Fluxo admin completo (1.3): challenge 2FA + verify para JWT."""
    step1 = client.post(
        "/api/v1/auth/tokens",
        {"username": username, "password": password},
        format="json",
    )
    assert step1.status_code == 200, step1.data
    challenge_id = step1.data["data"]["challenge_id"]
    challenge = cache.get(challenge_cache_key(challenge_id))
    assert challenge is not None
    code = challenge["code"]
    step2 = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )
    assert step2.status_code == 200, step2.data
    return step2.data["data"]["access_token"]
