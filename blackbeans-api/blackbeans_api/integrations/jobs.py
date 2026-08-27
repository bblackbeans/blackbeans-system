from __future__ import annotations

from uuid import UUID  # noqa: TC003

from django.db.models import Count
from django.db.models import Q

from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RdSyncJob
from blackbeans_api.integrations.models import RdSyncJobItem
from blackbeans_api.integrations.models import SyncStatus
from blackbeans_api.integrations.oauth import get_settings
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.querysets import company_list_queryset

PROVIDER = Provider.RD_STATION_CRM
MAX_JOB_SIZE = 10000
ELIGIBLE_STATUSES = {SyncStatus.ERROR}
# not_sent = sem mapping


def snapshot_filters(params) -> dict[str, str]:
    keys = (
        "q",
        "search",
        "origem",
        "freshness",
        "contact_status",
        "has_cnpj",
        "has_phone",
        "has_email",
        "quality",
        "decision_makers",
        "hide_generic_email",
        "hide_shared_phone",
        "rd_status",
        "ordering",
    )
    snapshot = {}
    for key in keys:
        value = params.get(key)
        if value:
            snapshot[key] = value
    return snapshot


def resolve_company_ids(
    *, params, company_ids: list[UUID], select_all_matching: bool,
) -> list[UUID]:
    if select_all_matching:
        return list(
            company_list_queryset(params).values_list("pk", flat=True)[:MAX_JOB_SIZE],
        )
    if not company_ids:
        return []
    found = set(
        LeadCompany.objects.filter(pk__in=company_ids).values_list("pk", flat=True),
    )
    return [item for item in company_ids if item in found]


def company_sync_status_map(company_ids: list[UUID]) -> dict[UUID, str]:
    if not company_ids:
        return {}
    rows = RdEntityMapping.objects.filter(
        provider=PROVIDER,
        local_type=LocalType.COMPANY,
        local_id__in=company_ids,
    ).values_list("local_id", "sync_status")
    return dict(rows)


def eligible_company_ids(company_ids: list[UUID], *, force_resync: bool) -> list[UUID]:
    status_map = company_sync_status_map(company_ids)
    if force_resync:
        return [
            company_id
            for company_id in company_ids
            if status_map.get(company_id) != SyncStatus.SYNCING
        ]
    selected = []
    for company_id in company_ids:
        status = status_map.get(company_id)
        if status is None or status in ELIGIBLE_STATUSES:
            selected.append(company_id)
    return selected


def preview_sync(*, params, company_ids: list[UUID], select_all_matching: bool) -> dict:
    cfg = get_settings()
    ids = resolve_company_ids(
        params=params,
        company_ids=company_ids,
        select_all_matching=select_all_matching or not company_ids,
    )
    status_map = company_sync_status_map(ids)
    not_sent = [pk for pk in ids if pk not in status_map]
    already = [pk for pk, status in status_map.items() if status == SyncStatus.SYNCED]
    errors = [pk for pk, status in status_map.items() if status == SyncStatus.ERROR]
    syncing = [pk for pk, status in status_map.items() if status == SyncStatus.SYNCING]
    pending = [
        pk for pk, status in status_map.items() if status == SyncStatus.PENDING_UPDATE
    ]
    eligible = eligible_company_ids(ids, force_resync=False)
    contacts = Lead.objects.filter(company_id__in=eligible)
    if cfg.only_contacts_with_email_or_phone:
        contacts = contacts.filter(Q(email__gt="") | Q(phone__gt=""))
    contact_count = contacts.count()
    deals = 0
    if cfg.create_deals:
        deal_mapped = set(
            RdEntityMapping.objects.filter(
                provider=PROVIDER,
                local_type=LocalType.DEAL,
                local_id__in=eligible,
            ).values_list("local_id", flat=True),
        )
        deals = (
            LeadCompany.objects.filter(pk__in=eligible)
            .exclude(pk__in=deal_mapped)
            .filter(completeness_score__gte=int(cfg.min_score_for_deal or 0))
            .count()
        )
    return {
        "found": len(ids),
        "eligible": len(eligible),
        "already_synced": len(already),
        "not_sent": len(not_sent),
        "error": len(errors),
        "syncing": len(syncing),
        "pending_update": len(pending),
        "contacts": contact_count,
        "deals_would_create": deals,
        "create_deals": cfg.create_deals,
        "capped": len(ids) >= MAX_JOB_SIZE,
    }


def job_to_dict(job: RdSyncJob) -> dict:
    counts = job.items.aggregate(
        pending=Count("pk", filter=Q(status="pending")),
        syncing=Count("pk", filter=Q(status="syncing")),
        synced=Count("pk", filter=Q(status="synced")),
        error=Count("pk", filter=Q(status="error")),
        skipped=Count("pk", filter=Q(status="skipped")),
    )
    return {
        "id": str(job.pk),
        "status": job.status,
        "total": job.total,
        "done": job.done_count,
        "success": job.success_count,
        "error": job.error_count,
        "skipped": job.skipped_count,
        "force_resync": job.force_resync,
        "select_all_matching": job.select_all_matching,
        "create_deals": job.create_deals_snapshot,
        "filter_snapshot": job.filter_snapshot,
        "last_error": job.last_error,
        "created_at": job.created_at.isoformat().replace("+00:00", "Z")
        if job.created_at
        else None,
        "started_at": job.started_at.isoformat().replace("+00:00", "Z")
        if job.started_at
        else None,
        "finished_at": job.finished_at.isoformat().replace("+00:00", "Z")
        if job.finished_at
        else None,
        "items": {key: int(counts.get(key) or 0) for key in counts},
    }


def create_sync_job(
    *,
    params,
    company_ids: list[UUID],
    select_all_matching: bool,
    force_resync: bool,
    user,
) -> RdSyncJob:
    cfg = get_settings()
    ids = resolve_company_ids(
        params=params,
        company_ids=company_ids,
        select_all_matching=select_all_matching,
    )
    ids = eligible_company_ids(ids, force_resync=force_resync)
    job = RdSyncJob.objects.create(
        filter_snapshot=snapshot_filters(params),
        select_all_matching=select_all_matching,
        force_resync=force_resync,
        create_deals_snapshot=cfg.create_deals,
        total=len(ids),
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )
    RdSyncJobItem.objects.bulk_create(
        [RdSyncJobItem(job=job, company_id=company_id) for company_id in ids],
        batch_size=500,
    )
    return job
