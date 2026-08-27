from __future__ import annotations

from rest_framework import serializers


class RdSyncCreateSerializer(serializers.Serializer):
    select_all_matching = serializers.BooleanField(required=False, default=False)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    force_resync = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        select_all = bool(attrs.get("select_all_matching"))
        ids = attrs.get("company_ids") or []
        if not select_all and not ids:
            message = "Informe company_ids ou select_all_matching."
            raise serializers.ValidationError(message)
        return attrs


class RdSettingsUpdateSerializer(serializers.Serializer):
    create_deals = serializers.BooleanField(required=False)
    pipeline_id = serializers.CharField(required=False, allow_blank=True, max_length=24)
    stage_id = serializers.CharField(required=False, allow_blank=True, max_length=24)
    owner_id = serializers.CharField(required=False, allow_blank=True, max_length=24)
    source_id = serializers.CharField(required=False, allow_blank=True, max_length=24)
    min_score_for_deal = serializers.IntegerField(
        required=False, min_value=0, max_value=100,
    )
    only_contacts_with_email_or_phone = serializers.BooleanField(required=False)
    cnpj_custom_field_slug = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=80,
    )
    legal_bases = serializers.ListField(required=False, child=serializers.DictField())
