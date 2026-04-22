from __future__ import annotations

from blackbeans_api.governance.models import AuditLog


def log_audit_event(
    *,
    event_type: str,
    action: str = "",
    entity_type: str = "",
    entity_id: str = "",
    actor_id: int | None = None,
    workspace_id: str | None = None,
    correlation_id: str = "",
    before: dict | None = None,
    after: dict | None = None,
    metadata: dict | None = None,
) -> None:
    AuditLog.objects.create(
        event_type=event_type,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        workspace_id=workspace_id,
        correlation_id=correlation_id,
        before=before or {},
        after=after or {},
        metadata=metadata or {},
    )
