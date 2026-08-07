from __future__ import annotations

from rest_framework import serializers

from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadImport


def _iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def lead_import_to_representation(batch: LeadImport) -> dict:
    return {
        "id": str(batch.pk),
        "origem": batch.origem,
        "freshness": batch.freshness,
        "filename": batch.filename,
        "column_keys": list(batch.column_keys or []),
        "row_count": batch.row_count,
        "created_by_id": batch.created_by_id,
        "created_at": _iso(batch.created_at),
        "updated_at": _iso(batch.updated_at),
    }


def lead_to_representation(lead: Lead, *, include_payload: bool = True) -> dict:
    batch = lead.import_batch
    data = {
        "id": str(lead.pk),
        "import_id": str(batch.pk),
        "origem": batch.origem,
        "freshness": batch.freshness,
        "filename": batch.filename,
        "column_keys": list(batch.column_keys or []),
        "display_name": lead.display_name,
        "contact_status": lead.contact_status,
        "notes": lead.notes,
        "created_at": _iso(lead.created_at),
        "updated_at": _iso(lead.updated_at),
    }
    if include_payload:
        data["payload"] = dict(lead.payload or {})
    else:
        # Preview fields for list when filtering by origem (frontend picks keys)
        payload = dict(lead.payload or {})
        preview: dict[str, str | None] = {}
        for key in (batch.column_keys or [])[:8]:
            value = payload.get(key)
            preview[key] = None if value is None else str(value)
        data["payload_preview"] = preview
    return data


class LeadUpdateSerializer(serializers.Serializer):
    contact_status = serializers.ChoiceField(
        choices=Lead.ContactStatus.choices,
        required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Informe contact_status e/ou notes.")
        return attrs
