from __future__ import annotations

from uuid import UUID  # noqa: TC003

from django.conf import settings
from django.utils import timezone

from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RemoteType

EMPTY_RD_INFO = {
    "rd_status": "not_sent",
    "rd_remote_id": "",
    "rd_url": "",
    "rd_last_synced_at": None,
    "rd_last_error": "",
    "rd_deal": None,
}


def crm_entity_url(remote_type: str, remote_id: str) -> str:
    if not remote_id:
        return ""
    base = (settings.RDSTATION_CRM_APP_BASE_URL or "https://crm.rdstation.com").rstrip(
        "/",
    )
    suffix = {
        RemoteType.ORGANIZATION: "organizations",
        RemoteType.CONTACT: "contacts",
        RemoteType.DEAL: "deals",
    }.get(remote_type, remote_type)
    return f"{base}/#/{suffix}/{remote_id}"


def _iso(value):
    if not value:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value.isoformat().replace("+00:00", "Z")


def _info_from_mapping(
    mapping: RdEntityMapping | None, deal: RdEntityMapping | None,
) -> dict:
    if mapping is None:
        return dict(EMPTY_RD_INFO)
    deal_snap = None
    if deal and deal.remote_id:
        meta = deal.metadata or {}
        deal_snap = {
            "remote_id": deal.remote_id,
            "url": crm_entity_url(RemoteType.DEAL, deal.remote_id),
            "pipeline_name": meta.get("pipeline_name") or "",
            "stage_name": meta.get("stage_name") or "",
            "owner_name": meta.get("owner_name") or "",
            "deal_status": meta.get("deal_status") or "",
        }
    return {
        "rd_status": mapping.sync_status,
        "rd_remote_id": mapping.remote_id or "",
        "rd_url": crm_entity_url(mapping.remote_type, mapping.remote_id),
        "rd_last_synced_at": _iso(mapping.last_synced_at),
        "rd_last_error": mapping.last_error or "",
        "rd_deal": deal_snap,
    }


def rd_info_by_company_ids(company_ids: list[UUID]) -> dict[UUID, dict]:
    if not company_ids:
        return {}
    mappings = RdEntityMapping.objects.filter(
        provider=Provider.RD_STATION_CRM,
        local_id__in=company_ids,
        local_type__in=[LocalType.COMPANY, LocalType.DEAL],
    )
    by_company: dict[UUID, RdEntityMapping] = {}
    deals: dict[UUID, RdEntityMapping] = {}
    for row in mappings:
        if row.local_type == LocalType.COMPANY:
            by_company[row.local_id] = row
        elif row.local_type == LocalType.DEAL:
            deals[row.local_id] = row
    return {
        company_id: _info_from_mapping(
            by_company.get(company_id), deals.get(company_id),
        )
        for company_id in company_ids
    }


def rd_info_for_company(company_id: UUID) -> dict:
    return rd_info_by_company_ids([company_id]).get(company_id, dict(EMPTY_RD_INFO))
