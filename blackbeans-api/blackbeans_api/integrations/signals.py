from __future__ import annotations

from django.db.models.signals import post_save

from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import SyncStatus
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany

_CONNECTED: list[bool] = []
SKIP_PENDING_ATTR = "_rd_skip_pending_update"


def skip_pending_update(instance) -> None:
    setattr(instance, SKIP_PENDING_ATTR, True)


def _should_skip(instance) -> bool:
    return bool(getattr(instance, SKIP_PENDING_ATTR, False))


def _mark_pending(*, local_type: str, local_id) -> None:
    RdEntityMapping.objects.filter(
        provider=Provider.RD_STATION_CRM,
        local_type=local_type,
        local_id=local_id,
        sync_status=SyncStatus.SYNCED,
    ).update(sync_status=SyncStatus.PENDING_UPDATE)


def on_company_saved(sender, instance, **kwargs):
    if _should_skip(instance):
        return
    _mark_pending(local_type=LocalType.COMPANY, local_id=instance.pk)


def on_lead_saved(sender, instance, **kwargs):
    if _should_skip(instance):
        return
    _mark_pending(local_type=LocalType.CONTACT, local_id=instance.pk)
    if instance.company_id:
        _mark_pending(local_type=LocalType.COMPANY, local_id=instance.company_id)


def connect_signals() -> None:
    if _CONNECTED:
        return
    post_save.connect(on_company_saved, sender=LeadCompany)
    post_save.connect(on_lead_saved, sender=Lead)
    _CONNECTED.append(True)
