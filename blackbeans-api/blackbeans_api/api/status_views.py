from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.operations_serializers import task_status_definition_to_representation
from blackbeans_api.api.operations_serializers import validate_active_task_status
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import TaskStatusDefinition


class TaskStatusCatalogView(APIView):
    """GET catalogo (auth). PUT substitui catalogo (staff)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        include_inactive = str(request.query_params.get("include_inactive") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        qs = TaskStatusDefinition.objects.all().order_by("position", "key")
        if not include_inactive:
            qs = qs.filter(is_active=True)
        rows = list(qs)
        return success_response(
            correlation_id=correlation_id,
            data={"statuses": [task_status_definition_to_representation(row) for row in rows]},
            meta={"total": len(rows)},
        )

    def put(self, request: Request):
        if not (request.user.is_staff or request.user.is_superuser):
            return error_response(
                correlation_id=get_correlation_id(request),
                code="forbidden",
                message="Acesso restrito a perfil administrativo.",
                details={},
                http_status=status.HTTP_403_FORBIDDEN,
            )
        correlation_id = get_correlation_id(request)
        payload = request.data.get("statuses")
        if not isinstance(payload, list) or not payload:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Envie a lista statuses com ao menos um item.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        cleaned: list[dict] = []
        used_keys: set[str] = set()
        for index, raw in enumerate(payload):
            if not isinstance(raw, dict):
                continue
            label = str(raw.get("label") or "").strip()
            if not label:
                continue
            key = str(raw.get("key") or "").strip()
            if not key:
                key = (
                    label.encode("ascii", "ignore")
                    .decode("ascii")
                    .lower()
                    .replace(" ", "_")
                ) or f"status_{index + 1}"
            key = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in key).strip("_").lower()
            if not key:
                key = f"status_{index + 1}"
            base = key
            suffix = 2
            while key in used_keys:
                key = f"{base}_{suffix}"
                suffix += 1
            used_keys.add(key)
            cleaned.append(
                {
                    "key": key,
                    "label": label,
                    "color": str(raw.get("color") or "default")[:32],
                    "is_done_like": bool(raw.get("is_done_like")),
                    "position": int(raw.get("position") or (index + 1)),
                    "is_active": bool(raw.get("is_active", True)),
                },
            )

        if not cleaned:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Adicione pelo menos um status com rotulo.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        existing = {row.key: row for row in TaskStatusDefinition.objects.all()}
        keep_keys = {row["key"] for row in cleaned}
        for item in cleaned:
            row = existing.get(item["key"])
            if row is None:
                TaskStatusDefinition.objects.create(**item)
            else:
                for field, value in item.items():
                    setattr(row, field, value)
                row.save(
                    update_fields=["label", "color", "is_done_like", "position", "is_active", "updated_at"],
                )
        TaskStatusDefinition.objects.exclude(key__in=keep_keys).update(is_active=False)

        rows = list(TaskStatusDefinition.objects.filter(is_active=True).order_by("position", "key"))
        return success_response(
            correlation_id=correlation_id,
            data={"statuses": [task_status_definition_to_representation(row) for row in rows]},
            meta={"total": len(rows)},
        )


# silence unused import warning helpers for re-exports
__all__ = ["TaskStatusCatalogView", "validate_active_task_status"]
