from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import serializers

from blackbeans_api.governance.services.permissions import PERMISSION_KEYS
from blackbeans_api.governance.services.permissions import SCOPE_TYPES

User = get_user_model()

_SCOPE_CHOICES = [(x, x) for x in sorted(SCOPE_TYPES)]


class PermissionAssignmentWriteSerializer(serializers.Serializer):
    workspace_id = serializers.UUIDField()
    subject_type = serializers.ChoiceField(choices=[("user", "user")])
    subject_id = serializers.IntegerField(min_value=1)
    scope_type = serializers.ChoiceField(choices=_SCOPE_CHOICES)
    scope_id = serializers.UUIDField()
    permission_key = serializers.CharField(max_length=64)
    effect = serializers.ChoiceField(choices=["allow", "deny"])

    def validate_permission_key(self, value: str) -> str:
        if value not in PERMISSION_KEYS:
            raise serializers.ValidationError("Chave de permissao nao suportada.")
        return value

    def validate_subject_id(self, value: int) -> int:
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Usuario nao encontrado.")
        return value


class ConflictContextSerializer(serializers.Serializer):
    subject_type = serializers.ChoiceField(choices=[("user", "user")])
    subject_id = serializers.IntegerField(min_value=1)
    scope_type = serializers.ChoiceField(choices=_SCOPE_CHOICES)
    scope_id = serializers.UUIDField()
    permission_key = serializers.CharField(max_length=64)

    def validate(self, attrs):
        if attrs["permission_key"] not in PERMISSION_KEYS:
            raise serializers.ValidationError(
                {"permission_key": "Chave de permissao nao suportada."},
            )
        return attrs


class ProposedEffectSerializer(serializers.Serializer):
    effect = serializers.ChoiceField(choices=["allow", "deny"])


class ConflictPreviewSerializer(serializers.Serializer):
    workspace_id = serializers.UUIDField()
    context = ConflictContextSerializer()
    proposed = ProposedEffectSerializer()


class ConflictResolveSerializer(serializers.Serializer):
    workspace_id = serializers.UUIDField()
    context = ConflictContextSerializer()
    proposed = ProposedEffectSerializer()
    option_id = serializers.ChoiceField(choices=["apply_proposed", "keep_current"])


class BulkPermissionItemSerializer(serializers.Serializer):
    subject_type = serializers.ChoiceField(choices=[("user", "user")])
    subject_id = serializers.IntegerField(min_value=1)
    scope_type = serializers.ChoiceField(choices=_SCOPE_CHOICES)
    scope_id = serializers.UUIDField()
    permission_key = serializers.CharField(max_length=64)
    effect = serializers.ChoiceField(choices=["allow", "deny"])

    def validate_permission_key(self, value: str) -> str:
        if value not in PERMISSION_KEYS:
            raise serializers.ValidationError("Chave de permissao nao suportada.")
        return value


class BulkPreviewRequestSerializer(serializers.Serializer):
    workspace_id = serializers.UUIDField()
    items = BulkPermissionItemSerializer(many=True)

    def validate_items(self, value: list) -> list:
        max_items = int(getattr(settings, "BULK_PERMISSIONS_MAX_ITEMS", 500))
        if not value:
            msg = "Envie pelo menos um item."
            raise serializers.ValidationError(msg)
        if len(value) > max_items:
            msg = f"Limite de {max_items} itens excedido."
            raise serializers.ValidationError(msg)
        return value


class BulkApplyRequestSerializer(serializers.Serializer):
    preview_id = serializers.UUIDField()
    mode = serializers.ChoiceField(
        choices=["partial"],
        default="partial",
        required=False,
    )
