from __future__ import annotations

import re

from rest_framework import serializers

from blackbeans_api.clients.models import Client


def _normalize_cnpj(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _normalize_financial_emails(value: str) -> str:
    parts = [item.strip().lower() for item in (value or "").replace(",", ";").split(";")]
    return ";".join([item for item in parts if item])


def _validate_financial_emails(value: str) -> str:
    normalized = _normalize_financial_emails(value)
    if not normalized:
        raise serializers.ValidationError("Informe ao menos um e-mail financeiro.")
    email_re = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    invalid = [email for email in normalized.split(";") if not email_re.match(email)]
    if invalid:
        raise serializers.ValidationError(f"E-mail(s) invalido(s): {', '.join(invalid)}.")
    return normalized


class ClientCreateSerializer(serializers.ModelSerializer):
    portal_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    portal_username = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    portal_enabled = serializers.BooleanField(required=False)

    class Meta:
        model = Client
        fields = (
            "name",
            "cnpj",
            "contact_name",
            "financial_emails",
            "status",
            "description",
            "portal_username",
            "portal_password",
            "portal_enabled",
        )
        extra_kwargs = {
            "cnpj": {"required": True},
            "status": {"required": False},
            "contact_name": {"required": False, "allow_blank": True, "default": ""},
            "financial_emails": {"required": False, "allow_blank": True, "default": ""},
            "description": {"required": False, "allow_blank": True, "default": ""},
        }

    def validate_cnpj(self, value):
        if value is None:
            raise serializers.ValidationError("Informe o CNPJ.")
        normalized = _normalize_cnpj(value)
        if len(normalized) != 14:
            raise serializers.ValidationError("CNPJ deve ter 14 digitos.")
        return normalized

    def validate_financial_emails(self, value):
        return _validate_financial_emails(value)

    def validate_portal_username(self, value):
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    def create(self, validated_data):
        portal_password = validated_data.pop("portal_password", "") or ""
        portal_username = validated_data.get("portal_username")
        portal_enabled = validated_data.get("portal_enabled", False)
        if portal_enabled and not portal_username:
            raise serializers.ValidationError(
                {"portal_username": "Informe o usuario do portal quando o acesso estiver ativo."},
            )
        if portal_enabled and not portal_password:
            raise serializers.ValidationError(
                {"portal_password": "Informe a senha do portal quando o acesso estiver ativo."},
            )
        client = Client(**validated_data)
        if portal_password:
            client.set_portal_password(portal_password)
        client.save()
        return client


class ClientUpdateSerializer(serializers.ModelSerializer):
    portal_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    portal_username = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    portal_enabled = serializers.BooleanField(required=False)

    class Meta:
        model = Client
        fields = (
            "name",
            "cnpj",
            "contact_name",
            "financial_emails",
            "status",
            "description",
            "portal_username",
            "portal_password",
            "portal_enabled",
        )
        extra_kwargs = {
            "name": {"required": False},
            "cnpj": {"required": False},
            "contact_name": {"required": False, "allow_blank": True},
            "financial_emails": {"required": False, "allow_blank": True},
            "status": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate_cnpj(self, value):
        if value is None:
            return None
        normalized = _normalize_cnpj(value)
        if len(normalized) != 14:
            raise serializers.ValidationError("CNPJ deve ter 14 digitos.")
        return normalized

    def validate_financial_emails(self, value):
        return _validate_financial_emails(value)

    def validate_portal_username(self, value):
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    def update(self, instance, validated_data):
        portal_password = validated_data.pop("portal_password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        portal_enabled = instance.portal_enabled
        portal_username = instance.portal_username
        if portal_enabled and not portal_username:
            raise serializers.ValidationError(
                {"portal_username": "Informe o usuario do portal quando o acesso estiver ativo."},
            )
        if portal_enabled and not instance.portal_password_hash and not portal_password:
            raise serializers.ValidationError(
                {"portal_password": "Informe a senha do portal quando o acesso estiver ativo."},
            )
        if portal_password:
            instance.set_portal_password(portal_password)
        instance.save()
        return instance


def client_to_representation(client: Client) -> dict:
    return {
        "id": str(client.pk),
        "name": client.name,
        "cnpj": client.cnpj,
        "contact_name": client.contact_name,
        "financial_emails": client.financial_emails,
        "status": client.status,
        "description": client.description,
        "portal_username": client.portal_username,
        "portal_enabled": bool(client.portal_enabled),
        "portal_has_password": bool(client.portal_password_hash),
        "created_at": client.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": client.updated_at.isoformat().replace("+00:00", "Z"),
    }
