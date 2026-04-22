from __future__ import annotations

from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


def authenticate_admin_user(*, username: str | None, password: str | None, request):
    user = authenticate(
        request=request,
        username=username,
        password=password,
    )

    if not user or not user.is_active or not (user.is_staff or user.is_superuser):
        raise serializers.ValidationError(
            {
                "code": "invalid_credentials",
                "message": "Credenciais invalidas.",
            },
            code="authorization",
        )

    return user


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "username"

    @classmethod
    def build_token_payload(cls, user):
        refresh = cls.get_token(user)
        access = refresh.access_token

        return {
            "access_token": str(access),
            "refresh_token": str(refresh),
            "token_type": "Bearer",
            "actor_id": str(user.id),
        }

    @classmethod
    def try_build_token_payload_from_actor_id(cls, *, actor_id: str | None):
        if actor_id is None or str(actor_id).strip() == "":
            return None
        user_model = get_user_model()
        try:
            user = user_model.objects.get(pk=actor_id)
        except user_model.DoesNotExist:
            return None
        return cls.build_token_payload(user)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["actor_id"] = str(user.id)
        return token
