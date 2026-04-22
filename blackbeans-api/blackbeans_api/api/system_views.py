from __future__ import annotations

from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.views import APIView

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
