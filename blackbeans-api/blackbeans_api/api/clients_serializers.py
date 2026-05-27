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
    class Meta:
        model = Client
        fields = ("name", "cnpj", "contact_name", "financial_emails", "status", "description")
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


class ClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ("name", "cnpj", "contact_name", "financial_emails", "status", "description")
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


def client_to_representation(client: Client) -> dict:
    return {
        "id": str(client.pk),
        "name": client.name,
        "cnpj": client.cnpj,
        "contact_name": client.contact_name,
        "financial_emails": client.financial_emails,
        "status": client.status,
        "description": client.description,
        "created_at": client.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": client.updated_at.isoformat().replace("+00:00", "Z"),
    }
