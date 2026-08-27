from __future__ import annotations

import hashlib
import json
import logging
import secrets

from django.db import IntegrityError
from django.utils import timezone

from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.client import as_list
from blackbeans_api.integrations.client import unwrap_data
from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RdSyncLog
from blackbeans_api.integrations.models import RdWebhookEvent
from blackbeans_api.integrations.models import RemoteType
from blackbeans_api.integrations.models import WebhookEventStatus
from blackbeans_api.integrations.oauth import connected_client
from blackbeans_api.integrations.oauth import get_settings
from blackbeans_api.integrations.oauth import webhook_url
from blackbeans_api.integrations.signals import skip_pending_update
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.scoring import apply_prospect_quality
from blackbeans_api.leads.scoring import compute_prospect_score
from blackbeans_api.leads.services import recompute_company_quality

logger = logging.getLogger(__name__)
PROVIDER = Provider.RD_STATION_CRM
WEBHOOK_EVENTS = (
    "crm_deal_created",
    "crm_deal_updated",
    "crm_deal_deleted",
    "crm_contact_updated",
)


def _first_value(items: list | None, key: str) -> str:
    if not items:
        return ""
    first = items[0]
    if isinstance(first, dict):
        return str(first.get(key) or first.get("value") or "")
    return str(first)


def extract_event_type(payload: dict) -> str:
    return str(
        payload.get("event_type")
        or payload.get("event_name")
        or payload.get("event")
        or "",
    )


def extract_transaction_uuid(payload: dict, raw: bytes) -> str:
    value = payload.get("transaction_uuid") or payload.get("transactionUuid")
    nested = payload.get("data")
    if not value and isinstance(nested, dict):
        value = nested.get("transaction_uuid")
    if value:
        return str(value)[:64]
    digest = hashlib.sha256(
        raw or json.dumps(payload, sort_keys=True).encode(),
    ).hexdigest()
    return digest[:64]


def extract_document(payload: dict) -> dict:
    for key in ("document", "data", "entity"):
        value = payload.get(key)
        if isinstance(value, dict):
            inner = value.get("data")
            if isinstance(inner, dict):
                return inner
            return value
    return payload


def validate_webhook_header(request) -> bool:
    cfg = get_settings()
    header = (cfg.webhook_header_name or "X-BlackBeans-RD").strip()
    if not cfg.webhook_secret:
        return False
    received = request.headers.get(header) or request.META.get(
        f"HTTP_{header.upper().replace('-', '_')}",
        "",
    )
    return secrets.compare_digest(str(received), str(cfg.webhook_secret))


def ingest_webhook(payload: dict, raw: bytes) -> tuple[RdWebhookEvent, bool]:
    transaction_uuid = extract_transaction_uuid(payload, raw)
    event_type = extract_event_type(payload)
    try:
        event, created = RdWebhookEvent.objects.get_or_create(
            transaction_uuid=transaction_uuid,
            defaults={
                "event_type": event_type[:64],
                "payload": payload,
            },
        )
    except IntegrityError:
        event = RdWebhookEvent.objects.get(transaction_uuid=transaction_uuid)
        return event, False
    return event, created


def ensure_webhooks(*, transport=None) -> bool:
    url = webhook_url()
    if not url.startswith("https://"):
        logger.info("rd.webhook skip register url_not_https")
        return False
    cfg = get_settings()
    if not cfg.webhook_secret:
        cfg.webhook_secret = secrets.token_urlsafe(32)
        cfg.save(update_fields=["webhook_secret"])
    client = connected_client(transport=transport)
    existing = []
    try:
        existing = as_list(client.get("/webhooks"))
    except RdHttpError:
        logger.info("rd.webhook list failed")
    existing_keys = {
        (
            str(item.get("event_type") or ""),
            str(item.get("url") or item.get("entity_url") or ""),
        )
        for item in existing
    }
    for event_type in WEBHOOK_EVENTS:
        if (event_type, url) in existing_keys:
            continue
        try:
            client.post(
                "/webhooks",
                payload={
                    "data": {
                        "event_type": event_type,
                        "url": url,
                        "http_method": "POST",
                        "auth_header": cfg.webhook_header_name or "X-BlackBeans-RD",
                        "auth_key": cfg.webhook_secret,
                    },
                },
            )
        except RdHttpError as exc:
            logger.info(
                "rd.webhook register failed event=%s status=%s",
                event_type,
                exc.status_code,
            )
            return False
    cfg.webhook_registered = True
    cfg.save(update_fields=["webhook_registered", "updated_at"])
    return True


def _apply_contact_document(document: dict) -> None:  # noqa: C901
    remote_id = str(document.get("id") or document.get("_id") or "")
    mapping = None
    if remote_id:
        mapping = RdEntityMapping.objects.filter(
            provider=PROVIDER,
            remote_type=RemoteType.CONTACT,
            remote_id=remote_id,
        ).first()
    emails = document.get("emails") or []
    phones = document.get("phones") or []
    email = _first_value(emails, "email").strip().lower()
    phone = _first_value(phones, "phone").strip()
    lead = None
    if mapping:
        lead = Lead.objects.filter(pk=mapping.local_id).first()
    if lead is None and email:
        lead = Lead.objects.filter(email__iexact=email).first()
        if lead and mapping is None:
            RdEntityMapping.objects.get_or_create(
                provider=PROVIDER,
                local_type=LocalType.CONTACT,
                local_id=lead.pk,
                defaults={
                    "remote_type": RemoteType.CONTACT,
                    "remote_id": remote_id,
                    "sync_status": "synced",
                    "last_synced_at": timezone.now(),
                },
            )
    if lead is None:
        RdSyncLog.objects.create(
            action="webhook_contact_unmapped",
            success=True,
            message="Contato so no CRM, sem e-mail local.",
            extra={"remote_id": remote_id, "email": email},
        )
        return
    name = str(document.get("name") or "").strip()
    job_title = str(document.get("job_title") or "").strip()
    if name:
        lead.display_name = name
    if email:
        lead.email = email
    if phone:
        lead.phone = phone
    if job_title:
        lead.job_title = job_title
    quality = compute_prospect_score(
        cnpj=lead.cnpj,
        email=lead.email,
        phone=lead.phone,
        contact_name=lead.display_name,
        company_name=lead.company.name if lead.company_id else "",
        job_title=lead.job_title,
    )
    apply_prospect_quality(lead, quality)
    skip_pending_update(lead)
    lead.save()
    if lead.company_id:
        skip_pending_update(lead.company)
        recompute_company_quality(lead.company)
    RdSyncLog.objects.create(
        company_id=lead.company_id,
        action="webhook_contact_updated",
        success=True,
        message="contato atualizado",
        extra={"lead_id": str(lead.pk)},
    )


def _deal_snapshot(document: dict) -> dict:
    owner = document.get("owner") or document.get("user") or {}
    pipeline = document.get("pipeline") or {}
    stage = document.get("deal_stage") or document.get("stage") or {}
    if not isinstance(owner, dict):
        owner = {}
    if not isinstance(pipeline, dict):
        pipeline = {}
    if not isinstance(stage, dict):
        stage = {}
    return {
        "deal_status": str(document.get("status") or ""),
        "owner_id": str(document.get("owner_id") or owner.get("id") or ""),
        "owner_name": str(owner.get("name") or ""),
        "pipeline_id": str(document.get("pipeline_id") or pipeline.get("id") or ""),
        "pipeline_name": str(pipeline.get("name") or ""),
        "stage_id": str(
            document.get("deal_stage_id")
            or document.get("stage_id")
            or stage.get("id")
            or "",
        ),
        "stage_name": str(stage.get("name") or ""),
        "organization_id": str(document.get("organization_id") or ""),
    }


def _apply_deal_document(document: dict, *, deleted: bool) -> None:
    remote_id = str(document.get("id") or document.get("_id") or "")
    if not remote_id:
        return
    mapping = RdEntityMapping.objects.filter(
        provider=PROVIDER,
        remote_type=RemoteType.DEAL,
        remote_id=remote_id,
    ).first()
    if mapping is None:
        org_id = str(document.get("organization_id") or "")
        org_map = None
        if org_id:
            org_map = RdEntityMapping.objects.filter(
                provider=PROVIDER,
                remote_type=RemoteType.ORGANIZATION,
                remote_id=org_id,
            ).first()
        if org_map is None:
            RdSyncLog.objects.create(
                action="webhook_deal_unmapped",
                success=True,
                message="Deal sem empresa mapeada.",
                extra={"remote_id": remote_id},
            )
            return
        mapping, _ = RdEntityMapping.objects.get_or_create(
            provider=PROVIDER,
            local_type=LocalType.DEAL,
            local_id=org_map.local_id,
            defaults={
                "remote_type": RemoteType.DEAL,
                "remote_id": remote_id,
                "sync_status": "synced",
            },
        )
    if deleted:
        meta = dict(mapping.metadata or {})
        meta["deal_status"] = "deleted"
        mapping.metadata = meta
        mapping.sync_status = "synced"
        mapping.save(update_fields=["metadata", "sync_status", "updated_at"])
        RdSyncLog.objects.create(
            company_id=mapping.local_id,
            action="webhook_deal_deleted",
            success=True,
            extra={"remote_id": remote_id},
        )
        return
    meta = dict(mapping.metadata or {})
    meta.update(_deal_snapshot(document))
    mapping.metadata = meta
    mapping.remote_id = remote_id
    mapping.last_synced_at = timezone.now()
    mapping.sync_status = "synced"
    mapping.save()
    RdSyncLog.objects.create(
        company_id=mapping.local_id,
        action="webhook_deal_updated",
        success=True,
        extra={"remote_id": remote_id, "deal_status": meta.get("deal_status")},
    )


def process_webhook_event(event: RdWebhookEvent) -> None:
    payload = event.payload if isinstance(event.payload, dict) else {}
    event_type = event.event_type or extract_event_type(payload)
    document = extract_document(payload)
    try:
        if event_type == "crm_contact_updated":
            _apply_contact_document(document)
        elif event_type in {"crm_deal_created", "crm_deal_updated"}:
            _apply_deal_document(document, deleted=False)
        elif event_type == "crm_deal_deleted":
            _apply_deal_document(document, deleted=True)
        else:
            event.status = WebhookEventStatus.IGNORED
            event.processed_at = timezone.now()
            event.save(update_fields=["status", "processed_at"])
            return
        event.status = WebhookEventStatus.PROCESSED
        event.processed_at = timezone.now()
        event.error_message = ""
        event.save(update_fields=["status", "processed_at", "error_message"])
    except Exception as exc:
        logger.exception("rd.webhook process failed event=%s", event.pk)
        event.status = WebhookEventStatus.ERROR
        event.error_message = str(exc)[:2000]
        event.processed_at = timezone.now()
        event.save(update_fields=["status", "error_message", "processed_at"])


def reconcile_mapped_entities(*, transport=None, limit: int = 500) -> dict:
    client = connected_client(transport=transport, max_retry_after=20)
    mappings = list(
        RdEntityMapping.objects.filter(
            provider=PROVIDER,
            remote_id__gt="",
            sync_status__in=["synced", "pending_update", "error"],
        ).order_by("last_synced_at")[:limit],
    )
    updated = 0
    errors = 0
    for mapping in mappings:
        path = {
            RemoteType.ORGANIZATION: f"/organizations/{mapping.remote_id}",
            RemoteType.CONTACT: f"/contacts/{mapping.remote_id}",
            RemoteType.DEAL: f"/deals/{mapping.remote_id}",
        }.get(mapping.remote_type)
        if not path:
            continue
        try:
            payload = unwrap_data(client.get(path))
        except RdHttpError as exc:
            errors += 1
            mapping.last_error = str(exc)[:2000]
            if exc.status_code == 404 and mapping.remote_type == RemoteType.DEAL:  # noqa: PLR2004
                meta = dict(mapping.metadata or {})
                meta["deal_status"] = "deleted"
                mapping.metadata = meta
            mapping.save(update_fields=["last_error", "metadata", "updated_at"])
            continue
        if mapping.remote_type == RemoteType.DEAL and isinstance(payload, dict):
            meta = dict(mapping.metadata or {})
            meta.update(_deal_snapshot(payload))
            mapping.metadata = meta
        if mapping.remote_type == RemoteType.CONTACT and isinstance(payload, dict):
            _apply_contact_document(payload)
        mapping.last_synced_at = timezone.now()
        mapping.last_error = ""
        if mapping.sync_status == "error":
            mapping.sync_status = "synced"
        mapping.save()
        updated += 1
    RdSyncLog.objects.create(
        action="reconcile",
        success=errors == 0,
        message=f"updated={updated} errors={errors}",
        extra={"updated": updated, "errors": errors, "scanned": len(mappings)},
    )
    return {"updated": updated, "errors": errors, "scanned": len(mappings)}
