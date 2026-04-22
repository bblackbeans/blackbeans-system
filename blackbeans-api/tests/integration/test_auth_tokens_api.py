from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
import pyotp
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.tokens import RefreshToken

from blackbeans_api.api.mfa import challenge_cache_key
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def create_totp_challenge(client: APIClient, *, username: str, password: str) -> str:
    login_response = client.post(
        "/api/v1/auth/tokens",
        {"username": username, "password": password},
        format="json",
    )
    assert login_response.status_code == 200

    challenge_id = login_response.data["data"]["challenge_id"]
    challenge = cache.get(challenge_cache_key(challenge_id))
    assert challenge is not None
    assert challenge["method"] == "totp"
    return challenge_id


def create_access_token(client: APIClient, *, username: str, password: str) -> str:
    login_response = client.post(
        "/api/v1/auth/tokens",
        {"username": username, "password": password},
        format="json",
    )
    assert login_response.status_code == 200
    payload = login_response.data["data"]
    if "access_token" in payload:
        return payload["access_token"]

    challenge_id = payload["challenge_id"]
    user = UserFactory._meta.model.objects.get(username=username)
    verify_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": pyotp.TOTP(user.totp_secret).now()},
        format="json",
    )
    assert verify_response.status_code == 200
    return verify_response.data["data"]["access_token"]


def test_admin_login_without_totp_returns_tokens_directly():
    password = "StrongPass123!@#"
    user = UserFactory.create(password=password, is_staff=True, is_active=True)
    client = APIClient()

    response = client.post(
        "/api/v1/auth/tokens",
        {"username": user.username, "password": password},
        format="json",
    )

    assert response.status_code == 200
    assert "data" in response.data
    assert "challenge_id" not in response.data["data"]
    assert "access_token" in response.data["data"]
    assert "refresh_token" in response.data["data"]
    assert response.data["data"]["requires_2fa_setup"] is True


def test_admin_login_with_invalid_credentials_returns_401_error_envelope():
    password = "StrongPass123!@#"
    user = UserFactory.create(password=password, is_staff=True, is_active=True)
    client = APIClient()

    response = client.post(
        "/api/v1/auth/tokens",
        {"username": user.username, "password": "wrong-password"},
        format="json",
    )

    assert response.status_code == 401
    assert "error" in response.data
    assert response.data["error"]["code"] == "invalid_credentials"
    assert "correlation_id" in response.data


def test_2fa_verify_returns_access_and_refresh_tokens():
    password = "StrongPass123!@#"
    secret = pyotp.random_base32()
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)
    code = pyotp.TOTP(secret).now()

    verify_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )

    assert verify_response.status_code == 200
    assert verify_response.data["data"]["token_type"] == "Bearer"
    assert "access_token" in verify_response.data["data"]
    assert "refresh_token" in verify_response.data["data"]
    access_token = AccessToken(verify_response.data["data"]["access_token"])
    assert "exp" in access_token.payload
    assert access_token.payload["actor_id"] == str(user.id)


def test_invalid_2fa_code_returns_401_and_no_tokens():
    password = "StrongPass123!@#"
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=pyotp.random_base32(),
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)

    response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": "000000"},
        format="json",
    )

    assert response.status_code == 401
    assert response.data["error"]["code"] == "invalid_2fa_code"
    assert "correlation_id" in response.data


def test_too_many_invalid_2fa_attempts_returns_429(settings):
    settings.AUTH_2FA_MAX_ATTEMPTS = 2
    settings.AUTH_2FA_LOCKOUT_SECONDS = 60

    password = "StrongPass123!@#"
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=pyotp.random_base32(),
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)

    for _ in range(2):
        response = client.post(
            "/api/v1/auth/tokens/2fa/verify",
            {"challenge_id": challenge_id, "code": "111111"},
            format="json",
        )

    assert response.status_code == 429
    assert response.data["error"]["code"] == "too_many_attempts"


def test_consumed_challenge_returns_401():
    password = "StrongPass123!@#"
    secret = pyotp.random_base32()
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)
    code = pyotp.TOTP(secret).now()

    first_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )
    assert second_response.status_code == 401
    assert second_response.data["error"]["code"] == "challenge_consumed"


def test_unknown_challenge_id_returns_401():
    client = APIClient()
    response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": str(uuid4()), "code": "123456"},
        format="json",
    )
    assert response.status_code == 401
    assert response.data["error"]["code"] == "challenge_invalid_or_expired"
    assert "correlation_id" in response.data


def test_refresh_returns_new_access_and_rotated_refresh_token():
    password = "StrongPass123!@#"
    secret = pyotp.random_base32()
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)
    code = pyotp.TOTP(secret).now()

    verify_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )
    first_refresh = verify_response.data["data"]["refresh_token"]

    refresh_response = client.post(
        "/api/v1/auth/tokens/refresh",
        {"refresh": first_refresh},
        format="json",
    )

    assert refresh_response.status_code == 200
    assert refresh_response.data["data"]["token_type"] == "Bearer"
    assert "access_token" in refresh_response.data["data"]
    assert "refresh_token" in refresh_response.data["data"]
    assert refresh_response.data["data"]["refresh_token"] != first_refresh


def test_reusing_rotated_refresh_token_returns_401():
    password = "StrongPass123!@#"
    secret = pyotp.random_base32()
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    client = APIClient()
    challenge_id = create_totp_challenge(client, username=user.username, password=password)
    code = pyotp.TOTP(secret).now()

    verify_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": code},
        format="json",
    )
    first_refresh = verify_response.data["data"]["refresh_token"]

    refresh_response = client.post(
        "/api/v1/auth/tokens/refresh",
        {"refresh": first_refresh},
        format="json",
    )
    assert refresh_response.status_code == 200

    reused_response = client.post(
        "/api/v1/auth/tokens/refresh",
        {"refresh": first_refresh},
        format="json",
    )

    assert reused_response.status_code == 401
    assert reused_response.data["error"]["code"] == "token_reused"
    assert "correlation_id" in reused_response.data


def test_expired_refresh_token_returns_401():
    user = UserFactory.create(is_staff=True, is_active=True)
    expired_refresh = RefreshToken.for_user(user)
    expired_refresh.set_exp(lifetime=timedelta(seconds=-1))

    client = APIClient()
    response = client.post(
        "/api/v1/auth/tokens/refresh",
        {"refresh": str(expired_refresh)},
        format="json",
    )

    assert response.status_code == 401
    assert response.data["error"]["code"] == "token_expired"
    assert "correlation_id" in response.data


def test_totp_login_flow_uses_authenticator_code():
    password = "StrongPass123!@#"
    secret = pyotp.random_base32()
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    client = APIClient()

    login_response = client.post(
        "/api/v1/auth/tokens",
        {"username": user.username, "password": password},
        format="json",
    )
    assert login_response.status_code == 200
    assert login_response.data["data"]["method"] == "totp"
    challenge_id = login_response.data["data"]["challenge_id"]

    verify_response = client.post(
        "/api/v1/auth/tokens/2fa/verify",
        {"challenge_id": challenge_id, "code": pyotp.TOTP(secret).now()},
        format="json",
    )
    assert verify_response.status_code == 200
    assert "access_token" in verify_response.data["data"]


def test_authenticated_user_can_enable_and_disable_totp():
    password = "StrongPass123!@#"
    user = UserFactory.create(password=password, is_staff=True, is_active=True)
    client = APIClient()
    access_token = create_access_token(client, username=user.username, password=password)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    settings_response = client.get("/api/v1/auth/2fa/settings")
    assert settings_response.status_code == 200
    assert settings_response.data["data"]["totp_enabled"] is False

    start_response = client.post("/api/v1/auth/2fa/enroll/start", {}, format="json")
    assert start_response.status_code == 200
    pending_secret = start_response.data["data"]["secret"]

    confirm_response = client.post(
        "/api/v1/auth/2fa/enroll/confirm",
        {"code": pyotp.TOTP(pending_secret).now()},
        format="json",
    )
    assert confirm_response.status_code == 200
    recovery_codes = confirm_response.data["data"]["recovery_codes"]
    assert len(recovery_codes) == 8

    settings_enabled_response = client.get("/api/v1/auth/2fa/settings")
    assert settings_enabled_response.status_code == 200
    assert settings_enabled_response.data["data"]["totp_enabled"] is True

    disable_response = client.post(
        "/api/v1/auth/2fa/disable",
        {"code": recovery_codes[0]},
        format="json",
    )
    assert disable_response.status_code == 200
    assert disable_response.data["data"]["totp_enabled"] is False
