from __future__ import annotations

from rest_framework import serializers

from blackbeans_api.clients.models import Client


class ClientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ("name", "status", "description")
        extra_kwargs = {
            "status": {"required": False},
            "description": {"required": False, "allow_blank": True, "default": ""},
        }


class ClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ("name", "status", "description")
        extra_kwargs = {
            "name": {"required": False},
            "status": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }


def client_to_representation(client: Client) -> dict:
    return {
        "id": str(client.pk),
        "name": client.name,
        "status": client.status,
        "description": client.description,
        "created_at": client.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": client.updated_at.isoformat().replace("+00:00", "Z"),
    }
