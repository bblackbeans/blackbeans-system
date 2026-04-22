from __future__ import annotations

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsSuperuser
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import AuditLog


def _audit_to_representation(log: AuditLog) -> dict:
    return {
        "id": str(log.pk),
        "event_type": log.event_type,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "actor_id": log.actor_id,
        "workspace_id": str(log.workspace_id) if log.workspace_id else None,
        "correlation_id": log.correlation_id,
        "before": log.before,
        "after": log.after,
        "metadata": log.metadata,
        "created_at": log.created_at.isoformat().replace("+00:00", "Z"),
    }


class AuditDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        qs = AuditLog.objects.all()
        from_dt = parse_datetime(request.query_params.get("from", "") or "")
        to_dt = parse_datetime(request.query_params.get("to", "") or "")
        if from_dt:
            qs = qs.filter(created_at__gte=from_dt)
        if to_dt:
            qs = qs.filter(created_at__lte=to_dt)

        by_type = list(qs.values("event_type").annotate(total=Count("id")).order_by("-total")[:10])
        failures = qs.filter(event_type__icontains="failed").count()
        now = timezone.now()
        last_24h = qs.filter(created_at__gte=now - timedelta(hours=24)).count()

        return success_response(
            correlation_id=correlation_id,
            data={
                "total_logs": qs.count(),
                "failures": failures,
                "last_24h": last_24h,
                "volume_by_type": by_type,
            },
        )


class AuditLogsView(APIView):
    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        qs = AuditLog.objects.select_related("actor", "workspace").all()
        actor_id = request.query_params.get("actor_id")
        event_type = request.query_params.get("event_type")
        workspace_id = request.query_params.get("workspace_id")
        from_dt = parse_datetime(request.query_params.get("from", "") or "")
        to_dt = parse_datetime(request.query_params.get("to", "") or "")
        page = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)

        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        if event_type:
            qs = qs.filter(event_type=event_type)
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)
        if from_dt:
            qs = qs.filter(created_at__gte=from_dt)
        if to_dt:
            qs = qs.filter(created_at__lte=to_dt)

        total = qs.count()
        pages = max((total + page_size - 1) // page_size, 1)
        start = (page - 1) * page_size
        logs = qs.order_by("-created_at")[start : start + page_size]
        return success_response(
            correlation_id=correlation_id,
            data={"logs": [_audit_to_representation(log) for log in logs]},
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
            },
            http_status=status.HTTP_200_OK,
        )
