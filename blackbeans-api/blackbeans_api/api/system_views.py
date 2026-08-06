from __future__ import annotations

from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        checks = {"database": "ok"}
        http_status = status.HTTP_200_OK
        overall = "ok"

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            checks["database"] = "fail"
            overall = "fail"
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE

        return success_response(
            correlation_id=correlation_id,
            data={
                "status": overall,
                "timestamp": timezone.now().isoformat().replace("+00:00", "Z"),
                "checks": checks,
            },
            http_status=http_status,
        )


class InfrastructureHealthView(APIView):
    """Snapshot de DB/disco/Redis + alertas ativos (staff). Pode forcar um check."""

    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        from blackbeans_api.feedback.infra_monitor import collect_infrastructure_snapshot
        from blackbeans_api.feedback.infra_monitor import evaluate_infrastructure_alerts
        from blackbeans_api.feedback.infra_monitor import open_system_alerts_count

        correlation_id = get_correlation_id(request)
        snapshot = collect_infrastructure_snapshot()
        alerts = evaluate_infrastructure_alerts(snapshot)
        return success_response(
            correlation_id=correlation_id,
            data={
                "snapshot": snapshot,
                "alerts": [
                    {
                        "fingerprint": a.fingerprint,
                        "severity": a.severity,
                        "title": a.title,
                        "reasons": a.reasons,
                        "metrics": a.metrics,
                    }
                    for a in alerts
                ],
                "open_infra_reports": open_system_alerts_count(),
            },
        )

    def post(self, request: Request):
        from blackbeans_api.feedback.infra_monitor import run_infrastructure_health_check

        correlation_id = get_correlation_id(request)
        result = run_infrastructure_health_check()
        return success_response(correlation_id=correlation_id, data=result)
