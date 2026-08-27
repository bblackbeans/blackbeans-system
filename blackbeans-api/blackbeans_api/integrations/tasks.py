from __future__ import annotations

from celery import shared_task
from django.db.models import Count
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.models import JobItemStatus
from blackbeans_api.integrations.models import JobStatus
from blackbeans_api.integrations.models import RdSyncJob
from blackbeans_api.integrations.models import RdSyncJobItem
from blackbeans_api.integrations.models import RdWebhookEvent
from blackbeans_api.integrations.sync import sync_company
from blackbeans_api.integrations.webhooks import process_webhook_event
from blackbeans_api.integrations.webhooks import reconcile_mapped_entities

FANOUT_DELAY = 0.55


def _refresh_job(job: RdSyncJob) -> None:
    counts = job.items.aggregate(
        success=Count("pk", filter=Q(status=JobItemStatus.SYNCED)),
        error=Count("pk", filter=Q(status=JobItemStatus.ERROR)),
        skipped=Count("pk", filter=Q(status=JobItemStatus.SKIPPED)),
        pending=Count("pk", filter=Q(status=JobItemStatus.PENDING)),
        syncing=Count("pk", filter=Q(status=JobItemStatus.SYNCING)),
    )
    job.success_count = int(counts["success"] or 0)
    job.error_count = int(counts["error"] or 0)
    job.skipped_count = int(counts["skipped"] or 0)
    remaining = int(counts["pending"] or 0) + int(counts["syncing"] or 0)
    if remaining == 0:
        job.finished_at = timezone.now()
        if job.total and job.success_count == 0 and job.error_count == job.total:
            job.status = JobStatus.FAILED
        else:
            job.status = JobStatus.DONE
    job.save(
        update_fields=[
            "success_count",
            "error_count",
            "skipped_count",
            "status",
            "finished_at",
        ],
    )


@shared_task(name="blackbeans_api.integrations.tasks.start_rd_sync_job")
def start_rd_sync_job(job_id: str) -> dict:
    job = RdSyncJob.objects.filter(pk=job_id).first()
    if job is None:
        return {"ok": False, "reason": "missing"}
    job.status = JobStatus.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])
    items = list(job.items.filter(status=JobItemStatus.PENDING).order_by("created_at"))
    if not items:
        _refresh_job(job)
        return {"ok": True, "queued": 0}
    for index, item in enumerate(items):
        sync_rd_company_item.apply_async(
            args=[str(item.pk)],
            countdown=round(index * FANOUT_DELAY, 2),
        )
    return {"ok": True, "queued": len(items)}


@shared_task(
    bind=True,
    name="blackbeans_api.integrations.tasks.sync_rd_company_item",
    soft_time_limit=50,
    time_limit=90,
    autoretry_for=(RdHttpError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def sync_rd_company_item(_self, item_id: str) -> dict:
    item = RdSyncJobItem.objects.select_related("job").filter(pk=item_id).first()
    if item is None:
        return {"ok": False, "reason": "missing"}
    item.status = JobItemStatus.SYNCING
    item.save(update_fields=["status", "updated_at"])
    try:
        result = sync_company(
            item.company_id,
            force_resync=item.job.force_resync,
            job=item.job,
        )
    except RdHttpError as exc:
        if exc.retryable:
            raise
        item.status = JobItemStatus.ERROR
        item.error_message = str(exc)[:2000]
        item.save(update_fields=["status", "error_message", "updated_at"])
        _refresh_job(item.job)
        return {"ok": False, "status": "error"}
    status = result.get("status")
    if status == "synced":
        item.status = JobItemStatus.SYNCED
        item.error_message = ""
    elif status == "skipped":
        item.status = JobItemStatus.SKIPPED
        item.error_message = str(result.get("reason") or "")
    else:
        item.status = JobItemStatus.ERROR
        item.error_message = str(result.get("reason") or "")[:2000]
    item.save(update_fields=["status", "error_message", "updated_at"])
    _refresh_job(item.job)
    return result


@shared_task(name="blackbeans_api.integrations.tasks.process_rd_webhook_event")
def process_rd_webhook_event(event_id: str) -> None:
    event = RdWebhookEvent.objects.filter(pk=event_id).first()
    if event is None:
        return
    process_webhook_event(event)


@shared_task(name="blackbeans_api.integrations.tasks.reconcile_rd_mappings")
def reconcile_rd_mappings() -> dict:
    return reconcile_mapped_entities()
