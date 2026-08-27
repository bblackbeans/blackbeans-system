from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID  # noqa: TC003

from django.db import transaction
from django.utils import timezone

from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.client import as_list
from blackbeans_api.integrations.client import unwrap_data
from blackbeans_api.integrations.models import IntegrationSettings
from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RdSyncLog
from blackbeans_api.integrations.models import RemoteType
from blackbeans_api.integrations.models import SyncStatus
from blackbeans_api.integrations.oauth import connected_client
from blackbeans_api.integrations.oauth import get_settings
from blackbeans_api.integrations.presenters import crm_entity_url
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany

logger = logging.getLogger(__name__)
PROVIDER = Provider.RD_STATION_CRM
REMOTE_ID_RE = re.compile(r"^[0-9a-f]{24}$")


def _log(  # noqa: PLR0913
    *,
    company_id,
    action: str,
    success: bool,
    message: str = "",
    extra=None,
    job=None,
):
    RdSyncLog.objects.create(
        company_id=company_id,
        job=job,
        action=action,
        success=success,
        message=message[:2000],
        extra=extra or {},
    )


def _remote_id(item: dict | None) -> str:
    if not item:
        return ""
    value = str(item.get("id") or item.get("_id") or "")
    return value if REMOTE_ID_RE.match(value) else value[:24]


def _website_url(domain: str) -> str:
    domain = (domain or "").strip()
    if not domain:
        return ""
    if domain.startswith(("http://", "https://")):
        return domain
    return f"https://{domain}"


def _claim_mapping(
    *,
    local_type: str,
    local_id: UUID,
    remote_type: str,
    force_resync: bool,
) -> tuple[RdEntityMapping | None, str]:
    with transaction.atomic():
        mapping = (
            RdEntityMapping.objects.select_for_update()
            .filter(provider=PROVIDER, local_type=local_type, local_id=local_id)
            .first()
        )
        if mapping is None:
            mapping = RdEntityMapping.objects.create(
                provider=PROVIDER,
                local_type=local_type,
                local_id=local_id,
                remote_type=remote_type,
                remote_id="",
                sync_status=SyncStatus.SYNCING,
            )
            return mapping, "created"
        if mapping.sync_status == SyncStatus.SYNCING:
            return None, "syncing"
        if mapping.sync_status == SyncStatus.SYNCED and not force_resync:
            return None, "already_synced"
        mapping.sync_status = SyncStatus.SYNCING
        mapping.last_error = ""
        mapping.save(update_fields=["sync_status", "last_error", "updated_at"])
        return mapping, "claimed"


def _finish_mapping(
    mapping: RdEntityMapping, *, remote_id: str, error: str = "", metadata=None,
):
    mapping.remote_id = remote_id or mapping.remote_id
    mapping.last_error = error[:2000]
    if error:
        mapping.sync_status = SyncStatus.ERROR
    else:
        mapping.sync_status = SyncStatus.SYNCED
        mapping.last_synced_at = timezone.now()
        mapping.last_error = ""
    if metadata:
        current = dict(mapping.metadata or {})
        current.update(metadata)
        mapping.metadata = current
    mapping.save()


def _organization_payload(
    company: LeadCompany, cfg: IntegrationSettings, *, owner_id: str = "",
) -> dict:
    data: dict[str, Any] = {"name": company.name}
    url = _website_url(company.website_domain)
    if url:
        data["url"] = url
    slug = (cfg.cnpj_custom_field_slug or "").strip()
    if company.cnpj and slug:
        data["custom_fields"] = {slug: company.cnpj}
    resolved_owner = (owner_id or cfg.owner_id or "").strip()
    if resolved_owner:
        data["owner_id"] = resolved_owner
    return {"data": data}


def _resolve_owner_id(client, cfg: IntegrationSettings) -> str:
    if (cfg.owner_id or "").strip():
        return cfg.owner_id.strip()
    try:
        rows = as_list(client.get("/users"))
    except RdHttpError:
        return ""
    if not rows:
        return ""
    return str(rows[0].get("id") or rows[0].get("_id") or "")


def _find_organization_by_cnpj(
    client, company: LeadCompany, cfg: IntegrationSettings,
) -> str:
    slug = (cfg.cnpj_custom_field_slug or "").strip()
    if not company.cnpj or not slug:
        return ""
    try:
        payload = client.get(
            "/organizations",
            query={"filter": f"@{slug}:{company.cnpj}"},
        )
    except RdHttpError:
        logger.info("rd.sync cnpj lookup failed company=%s", company.pk)
        return ""
    items = as_list(payload)
    return _remote_id(items[0]) if items else ""


def _sync_organization(
    client, company: LeadCompany, cfg: IntegrationSettings, mapping: RdEntityMapping,
) -> str:
    remote_id = mapping.remote_id or _find_organization_by_cnpj(client, company, cfg)
    owner_id = _resolve_owner_id(client, cfg)
    body = _organization_payload(company, cfg, owner_id=owner_id)
    if remote_id:
        client.put(f"/organizations/{remote_id}", payload=body)
        return remote_id
    created = unwrap_data(client.post("/organizations", payload=body))
    if isinstance(created, dict):
        return _remote_id(created)
    return ""


def _contact_payload(lead: Lead, org_id: str, cfg: IntegrationSettings) -> dict:
    data: dict[str, Any] = {
        "name": lead.display_name or lead.email or "Contato",
        "organization_id": org_id,
    }
    if lead.job_title:
        data["job_title"] = lead.job_title
    if lead.email:
        data["emails"] = [{"email": lead.email}]
    if lead.phone:
        data["phones"] = [{"phone": lead.phone}]
    bases = cfg.legal_bases or []
    if bases:
        data["legal_bases"] = bases
    return {"data": data}


def _find_contact_by_email(client, email: str) -> str:
    if not email:
        return ""
    try:
        payload = client.get("/contacts", query={"filter": f"email:{email}"})
    except RdHttpError:
        return ""
    items = as_list(payload)
    return _remote_id(items[0]) if items else ""


def _sync_contact(
    client, lead: Lead, org_id: str, cfg: IntegrationSettings, *, force_resync: bool,
) -> str:
    mapping, _reason = _claim_mapping(
        local_type=LocalType.CONTACT,
        local_id=lead.pk,
        remote_type=RemoteType.CONTACT,
        force_resync=force_resync,
    )
    if mapping is None:
        existing = RdEntityMapping.objects.filter(
            provider=PROVIDER,
            local_type=LocalType.CONTACT,
            local_id=lead.pk,
        ).first()
        return existing.remote_id if existing else ""
    try:
        remote_id = mapping.remote_id or _find_contact_by_email(client, lead.email)
        body = _contact_payload(lead, org_id, cfg)
        if remote_id:
            client.put(f"/contacts/{remote_id}", payload=body)
        else:
            created = unwrap_data(client.post("/contacts", payload=body))
            remote_id = _remote_id(created) if isinstance(created, dict) else ""
        if not remote_id:
            _finish_mapping(mapping, remote_id="", error="Contato sem id remoto.")
            return ""
        _finish_mapping(mapping, remote_id=remote_id)
        return remote_id  # noqa: TRY300
    except RdHttpError as exc:
        _finish_mapping(mapping, remote_id=mapping.remote_id, error=str(exc))
        if exc.retryable:
            raise
        return mapping.remote_id


def _deal_payload(
    company: LeadCompany, cfg: IntegrationSettings, org_id: str, contact_ids: list[str],
) -> dict:
    data: dict[str, Any] = {
        "name": company.name,
        "organization_id": org_id,
    }
    if cfg.pipeline_id:
        data["pipeline_id"] = cfg.pipeline_id
    if cfg.stage_id:
        data["stage_id"] = cfg.stage_id
    if cfg.owner_id:
        data["owner_id"] = cfg.owner_id
    if cfg.source_id:
        data["source_id"] = cfg.source_id
    if contact_ids:
        data["contact_ids"] = contact_ids
    return {"data": data}


def _sync_deal(  # noqa: C901, PLR0911, PLR0913
    client,
    company: LeadCompany,
    cfg: IntegrationSettings,
    org_id: str,
    contact_ids: list[str],
    *,
    force_resync: bool,
) -> str:
    if not cfg.create_deals:
        return ""
    if company.completeness_score < int(cfg.min_score_for_deal or 0):
        return ""
    if not cfg.pipeline_id or not cfg.stage_id:
        _log(
            company_id=company.pk,
            action="deal_skipped",
            success=True,
            message="Deal nao criado: pipeline/etapa nao configurados.",
        )
        return ""
    existing = RdEntityMapping.objects.filter(
        provider=PROVIDER,
        local_type=LocalType.DEAL,
        local_id=company.pk,
    ).first()
    if existing and existing.remote_id and not force_resync:
        return existing.remote_id
    mapping, _reason = _claim_mapping(
        local_type=LocalType.DEAL,
        local_id=company.pk,
        remote_type=RemoteType.DEAL,
        force_resync=force_resync,
    )
    if mapping is None:
        return existing.remote_id if existing else ""
    try:
        remote_id = mapping.remote_id
        if remote_id and force_resync:
            client.put(
                f"/deals/{remote_id}",
                payload=_deal_payload(company, cfg, org_id, contact_ids),
            )
        elif not remote_id:
            created = unwrap_data(
                client.post(
                    "/deals", payload=_deal_payload(company, cfg, org_id, contact_ids),
                ),
            )
            remote_id = _remote_id(created) if isinstance(created, dict) else ""
        if not remote_id:
            _finish_mapping(mapping, remote_id="", error="Deal sem id remoto.")
            return ""
        _finish_mapping(
            mapping,
            remote_id=remote_id,
            metadata={"url": crm_entity_url(RemoteType.DEAL, remote_id)},
        )
        return remote_id  # noqa: TRY300
    except RdHttpError as exc:
        _finish_mapping(mapping, remote_id=mapping.remote_id, error=str(exc))
        if exc.retryable:
            raise
        return mapping.remote_id


def contact_is_eligible(lead: Lead, cfg: IntegrationSettings) -> bool:
    if not cfg.only_contacts_with_email_or_phone:
        return True
    return bool((lead.email or "").strip() or (lead.phone or "").strip())


def sync_company(
    company_id: UUID,
    *,
    force_resync: bool = False,
    job=None,
    transport=None,
) -> dict:
    company = LeadCompany.objects.prefetch_related("contacts").get(pk=company_id)
    cfg = get_settings()
    mapping, reason = _claim_mapping(
        local_type=LocalType.COMPANY,
        local_id=company.pk,
        remote_type=RemoteType.ORGANIZATION,
        force_resync=force_resync,
    )
    if mapping is None:
        _log(
            company_id=company.pk,
            action="company_skipped",
            success=True,
            message=reason,
            job=job,
        )
        return {"status": "skipped", "reason": reason}
    client = connected_client(transport=transport, max_retry_after=20)
    try:
        org_id = _sync_organization(client, company, cfg, mapping)
        if not org_id:
            _finish_mapping(mapping, remote_id="", error="Organizacao sem id remoto.")
            _log(
                company_id=company.pk,
                action="organization",
                success=False,
                message="Organizacao sem id remoto.",
                job=job,
            )
            return {"status": "error", "reason": "no_remote_id"}
        contact_ids = []
        for lead in company.contacts.all():
            if not contact_is_eligible(lead, cfg):
                continue
            remote_contact = _sync_contact(
                client,
                lead,
                org_id,
                cfg,
                force_resync=force_resync,
            )
            if remote_contact:
                contact_ids.append(remote_contact)
        deal_id = _sync_deal(
            client,
            company,
            cfg,
            org_id,
            contact_ids,
            force_resync=force_resync,
        )
        _finish_mapping(
            mapping,
            remote_id=org_id,
            metadata={
                "deal_id": deal_id,
                "url": crm_entity_url(RemoteType.ORGANIZATION, org_id),
            },
        )
        _log(
            company_id=company.pk,
            action="sync_company",
            success=True,
            message="synced",
            extra={
                "organization_id": org_id,
                "contacts": len(contact_ids),
                "deal_id": deal_id,
            },
            job=job,
        )
        return {
            "status": "synced",
            "organization_id": org_id,
            "contacts": len(contact_ids),
            "deal_id": deal_id,
        }
    except RdHttpError as exc:
        _finish_mapping(mapping, remote_id=mapping.remote_id, error=str(exc))
        _log(
            company_id=company.pk,
            action="sync_company",
            success=False,
            message=str(exc),
            extra={"status_code": exc.status_code},
            job=job,
        )
        if exc.retryable:
            raise
        return {"status": "error", "reason": str(exc)}
