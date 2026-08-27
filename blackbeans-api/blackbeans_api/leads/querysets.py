from __future__ import annotations

from django.db.models import Q

from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.scoring import QUALITY_BEST_THRESHOLD

RD_STATUS_VALUES = {
    "not_sent",
    "syncing",
    "synced",
    "pending_update",
    "error",
}


def parse_bool_flag(raw: str | None) -> bool | None:
    if raw is None or raw == "":
        return None
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "sim"}:
        return True
    if value in {"0", "false", "no", "nao", "não"}:
        return False
    raise ValueError


def apply_quality_filters(queryset, params):
    has_cnpj = parse_bool_flag(params.get("has_cnpj"))
    has_phone = parse_bool_flag(params.get("has_phone"))
    has_email = parse_bool_flag(params.get("has_email"))
    decision_makers = parse_bool_flag(params.get("decision_makers"))
    hide_generic_email = parse_bool_flag(params.get("hide_generic_email"))
    hide_shared_phone = parse_bool_flag(params.get("hide_shared_phone"))
    if has_cnpj is True:
        queryset = queryset.filter(has_cnpj=True)
    if has_phone is True:
        queryset = queryset.filter(has_phone=True)
    if has_email is True:
        queryset = queryset.filter(has_email=True)
    if decision_makers is True:
        queryset = queryset.filter(contact_is_decision_maker=True)
    if hide_generic_email is True:
        queryset = queryset.exclude(email_is_generic=True)
    if hide_shared_phone is True:
        queryset = queryset.exclude(phone_is_shared=True)
    quality = (params.get("quality") or "").strip().lower()
    if quality == "best":
        queryset = queryset.filter(completeness_score__gte=QUALITY_BEST_THRESHOLD)
    elif quality and quality != "all":
        quality_error = "quality"
        raise ValueError(quality_error)
    return queryset


def apply_rd_status_filter(queryset, rd_status: str):
    mapped = RdEntityMapping.objects.filter(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
    )
    if rd_status == "not_sent":
        return queryset.exclude(pk__in=mapped.values("local_id"))
    return queryset.filter(
        pk__in=mapped.filter(sync_status=rd_status).values("local_id"),
    )


def company_list_queryset(params):
    queryset = apply_quality_filters(LeadCompany.objects.all(), params)
    origem = (params.get("origem") or "").strip()
    query = (params.get("q") or params.get("search") or "").strip()
    freshness = (params.get("freshness") or "").strip()
    contact_status = (params.get("contact_status") or "").strip()
    rd_status = (params.get("rd_status") or "").strip()
    if freshness:
        queryset = queryset.filter(freshness=freshness)
    if origem:
        queryset = queryset.filter(origem__iexact=origem)
    if contact_status:
        queryset = queryset.filter(contacts__contact_status=contact_status).distinct()
    if query:
        queryset = queryset.filter(
            Q(search_text__icontains=query)
            | Q(name__icontains=query)
            | Q(cnpj__icontains=query)
            | Q(notes__icontains=query),
        )
    if rd_status:
        if rd_status not in RD_STATUS_VALUES:
            rd_status_error = "rd_status"
            raise ValueError(rd_status_error)
        queryset = apply_rd_status_filter(queryset, rd_status)
    ordering = (params.get("ordering") or "-completeness_score").strip()
    allowed = {
        "completeness_score",
        "-completeness_score",
        "name",
        "-name",
        "contacts_count",
        "-contacts_count",
        "created_at",
        "-created_at",
    }
    if ordering in allowed:
        queryset = queryset.order_by(ordering, "name")
    return queryset
