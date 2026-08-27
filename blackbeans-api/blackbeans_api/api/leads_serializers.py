from __future__ import annotations

from rest_framework import serializers

from blackbeans_api.integrations.presenters import rd_info_for_company
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.models import LeadImport
from blackbeans_api.leads.scoring import QUALITY_BEST_THRESHOLD
from blackbeans_api.leads.scoring import prospect_quality_from_lead
from blackbeans_api.leads.services import normalize_cnpj


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


def lead_company_to_representation(
    company: LeadCompany,
    *,
    include_contacts: bool = False,
    rd_info: dict | None = None,
) -> dict:
    data = {
        "id": str(company.pk),
        "name": company.name,
        "cnpj": company.cnpj or "",
        "origem": company.origem,
        "freshness": company.freshness,
        "has_cnpj": company.has_cnpj,
        "has_phone": company.has_phone,
        "has_email": company.has_email,
        "completeness_score": company.completeness_score,
        "email_is_generic": company.email_is_generic,
        "email_is_shared": company.email_is_shared,
        "phone_is_shared": company.phone_is_shared,
        "contact_is_person": company.contact_is_person,
        "contact_is_decision_maker": company.contact_is_decision_maker,
        "website_domain": company.website_domain or "",
        "contacts_count": company.contacts_count,
        "notes": company.notes,
        "quality_best_threshold": QUALITY_BEST_THRESHOLD,
        "created_at": _iso(company.created_at),
        "updated_at": _iso(company.updated_at),
    }
    if include_contacts:
        contacts = list(company.contacts.all())[:200]
        data["contacts"] = [
            lead_to_representation(
                c,
                include_payload=False,
                include_score_breakdown=False,
            )
            for c in contacts
        ]
        if contacts:
            best = max(contacts, key=lambda row: row.completeness_score)
            data["score_breakdown"] = prospect_quality_from_lead(
                best,
                email_is_shared=best.email_is_shared,
                phone_is_shared=best.phone_is_shared,
            )["score_breakdown"]
        else:
            data["score_breakdown"] = []
    if rd_info is None:
        rd_info = rd_info_for_company(company.pk)
    data.update(rd_info)
    return data


def lead_to_representation(
    lead: Lead,
    *,
    include_payload: bool = True,
    include_score_breakdown: bool | None = None,
) -> dict:
    batch = lead.import_batch
    company = lead.company
    if include_score_breakdown is None:
        include_score_breakdown = include_payload
    data = {
        "id": str(lead.pk),
        "import_id": str(batch.pk) if batch else None,
        "company_id": str(company.pk) if company else None,
        "company_name": company.name if company else None,
        "origem": (
            (batch.origem if batch else None)
            or str((lead.payload or {}).get("origem") or "")
            or (company.origem if company else "")
            or ""
        ),
        "freshness": (batch.freshness if batch else None)
        or (company.freshness if company else "")
        or "",
        "filename": batch.filename if batch else "",
        "column_keys": list(batch.column_keys or []) if batch else [],
        "display_name": lead.display_name,
        "email": lead.email,
        "phone": lead.phone,
        "cnpj": lead.cnpj,
        "has_cnpj": lead.has_cnpj,
        "has_phone": lead.has_phone,
        "has_email": lead.has_email,
        "completeness_score": lead.completeness_score,
        "email_is_generic": lead.email_is_generic,
        "email_is_shared": lead.email_is_shared,
        "phone_is_shared": lead.phone_is_shared,
        "contact_is_person": lead.contact_is_person,
        "contact_is_decision_maker": lead.contact_is_decision_maker,
        "job_title": lead.job_title or "",
        "linkedin_url": lead.linkedin_url or "",
        "score_breakdown": (
            prospect_quality_from_lead(
                lead,
                email_is_shared=lead.email_is_shared,
                phone_is_shared=lead.phone_is_shared,
            )["score_breakdown"]
            if include_score_breakdown
            else []
        ),
        "contact_status": lead.contact_status,
        "notes": lead.notes,
        "created_at": _iso(lead.created_at),
        "updated_at": _iso(lead.updated_at),
    }
    if include_payload:
        data["payload"] = dict(lead.payload or {})
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


class LeadCompanyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=512)
    cnpj = serializers.CharField(required=False, allow_blank=True, max_length=32)
    origem = serializers.CharField(required=False, allow_blank=True, max_length=200)
    freshness = serializers.ChoiceField(
        choices=LeadCompany.Freshness.choices,
        required=False,
        default=LeadCompany.Freshness.NOVO,
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_cnpj(self, value):
        if not value:
            return ""
        normalized = normalize_cnpj(value)
        if not normalized:
            raise serializers.ValidationError("CNPJ invalido (14 digitos).")
        return normalized


class LeadCompanyUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=512)
    cnpj = serializers.CharField(required=False, allow_blank=True, max_length=32)
    origem = serializers.CharField(required=False, allow_blank=True, max_length=200)
    freshness = serializers.ChoiceField(choices=LeadCompany.Freshness.choices, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Informe ao menos um campo.")
        return attrs

    def validate_cnpj(self, value):
        if not value:
            return ""
        normalized = normalize_cnpj(value)
        if not normalized:
            raise serializers.ValidationError("CNPJ invalido (14 digitos).")
        return normalized


class LeadCreateSerializer(serializers.Serializer):
    company_id = serializers.UUIDField(required=False)
    company_name = serializers.CharField(required=False, allow_blank=True, max_length=512)
    company_cnpj = serializers.CharField(required=False, allow_blank=True, max_length=32)
    display_name = serializers.CharField(max_length=512)
    email = serializers.CharField(required=False, allow_blank=True, max_length=255)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=64)
    cnpj = serializers.CharField(required=False, allow_blank=True, max_length=32)
    contact_status = serializers.ChoiceField(
        choices=Lead.ContactStatus.choices,
        required=False,
        default=Lead.ContactStatus.NAO_CONTATADO,
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    job_title = serializers.CharField(required=False, allow_blank=True, max_length=120)
    origem = serializers.CharField(required=False, allow_blank=True, max_length=200)
    freshness = serializers.ChoiceField(
        choices=LeadCompany.Freshness.choices,
        required=False,
        default=LeadCompany.Freshness.NOVO,
    )

    def validate(self, attrs):
        if not attrs.get("company_id") and not (attrs.get("company_name") or "").strip():
            raise serializers.ValidationError(
                {"company_id": "Informe company_id ou company_name."},
            )
        return attrs

    def validate_cnpj(self, value):
        if not value:
            return ""
        normalized = normalize_cnpj(value)
        if not normalized:
            raise serializers.ValidationError("CNPJ invalido (14 digitos).")
        return normalized

    def validate_company_cnpj(self, value):
        if not value:
            return ""
        normalized = normalize_cnpj(value)
        if not normalized:
            raise serializers.ValidationError("CNPJ invalido (14 digitos).")
        return normalized
