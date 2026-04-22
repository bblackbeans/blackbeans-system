from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from blackbeans_api.users.models import Collaborator

User = get_user_model()


def user_to_representation(user) -> dict:
    return {
        "id": user.pk,
        "username": user.username,
        "email": user.email or "",
        "name": user.name or "",
        "is_active": user.is_active,
        "is_staff": user.is_staff,
    }


class AdminUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=12)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    is_staff = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username ja esta em uso.")
        return value

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email__iexact=value).exclude(email="").exists():
            raise serializers.ValidationError("Email ja esta em uso.")
        return value

    def validate_password(self, value: str) -> str:
        if not re.search(r"[A-Z]", value):
            raise serializers.ValidationError("Senha deve conter letra maiuscula.")
        if not re.search(r"[a-z]", value):
            raise serializers.ValidationError("Senha deve conter letra minuscula.")
        if not re.search(r"\d", value):
            raise serializers.ValidationError("Senha deve conter digito.")
        if not re.search(r"[^\w\s]", value):
            raise serializers.ValidationError("Senha deve conter caractere especial.")
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        user.name = validated_data.get("name") or ""
        user.is_staff = validated_data.get("is_staff", False)
        user.is_active = validated_data.get("is_active", True)
        user.is_superuser = False
        user.save()
        return user


class AdminUserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    is_staff = serializers.BooleanField(required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=12)

    def __init__(self, *args, instance=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.instance_user = instance

    def validate_email(self, value: str) -> str:
        qs = User.objects.filter(email__iexact=value).exclude(email="")
        if self.instance_user is not None:
            qs = qs.exclude(pk=self.instance_user.pk)
        if qs.exists():
            raise serializers.ValidationError("Email ja esta em uso.")
        return value

    def validate_password(self, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.search(r"[A-Z]", value):
            raise serializers.ValidationError("Senha deve conter letra maiuscula.")
        if not re.search(r"[a-z]", value):
            raise serializers.ValidationError("Senha deve conter letra minuscula.")
        if not re.search(r"\d", value):
            raise serializers.ValidationError("Senha deve conter digito.")
        if not re.search(r"[^\w\s]", value):
            raise serializers.ValidationError("Senha deve conter caractere especial.")
        return value

    def update(self, instance, validated_data):
        if "email" in validated_data:
            instance.email = validated_data["email"]
        if "name" in validated_data:
            instance.name = validated_data["name"]
        if "is_active" in validated_data:
            instance.is_active = validated_data["is_active"]
        if "is_staff" in validated_data:
            instance.is_staff = validated_data["is_staff"]
        if validated_data.get("password"):
            instance.set_password(validated_data["password"])
        instance.save()
        return instance


class CollaboratorLinkCreateSerializer(serializers.Serializer):
    collaborator_id = serializers.UUIDField()

    def validate(self, attrs):
        cid = attrs["collaborator_id"]
        try:
            attrs["collaborator"] = Collaborator.objects.get(pk=cid)
        except Collaborator.DoesNotExist as exc:
            raise serializers.ValidationError(
                {"collaborator_id": "Colaborador nao encontrado."},
            ) from exc
        return attrs
