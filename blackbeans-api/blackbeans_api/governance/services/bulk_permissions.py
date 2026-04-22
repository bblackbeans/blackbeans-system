from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any
from typing import Literal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone

from blackbeans_api.governance.models import PermissionAssignment
from blackbeans_api.governance.models import PermissionBulkPreview
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.services.permissions import PERMISSION_KEYS
from blackbeans_api.governance.services.permissions import SCOPE_TYPES
from blackbeans_api.governance.services.permissions import ScopeValidationError
from blackbeans_api.governance.services.permissions import build_conflict_preview
from blackbeans_api.governance.services.permissions import scope_belongs_to_workspace

User = get_user_model()
logger = logging.getLogger(__name__)

RowStatus = Literal["valid", "invalid"]


class InvalidPreviewPayloadError(Exception):
    """Payload persistido no preview esta invalido/inconsistente."""


def _preview_ttl_seconds() -> int:
    return int(getattr(settings, "BULK_PERMISSIONS_PREVIEW_TTL_SECONDS", 3600))


def validate_bulk_item(  # noqa: PLR0911, PLR0913
    workspace: Workspace,
    *,
    subject_type: str,
    subject_id: int,
    scope_type: str,
    scope_id: uuid.UUID,
    permission_key: str,
    effect: str,
) -> tuple[RowStatus, str | None, str | None]:
    """
    Valida um item de lote (dominio RBAC).
    Retorna (status, reason_code, message) com reason_* apenas se invalid.
    """
    if subject_type != "user":
        return (
            "invalid",
            "unsupported_subject_type",
            "Apenas subject_type=user e suportado.",
        )
    if permission_key not in PERMISSION_KEYS:
        return "invalid", "invalid_permission_key", "Chave de permissao nao suportada."
    if scope_type not in SCOPE_TYPES:
        return "invalid", "invalid_scope_type", "Tipo de escopo invalido."
    if effect not in ("allow", "deny"):
        return "invalid", "invalid_effect", "Efeito invalido."
    if not User.objects.filter(pk=subject_id).exists():
        return "invalid", "subject_not_found", "Usuario sujeito nao encontrado."
    try:
        scope_belongs_to_workspace(workspace, scope_type, scope_id)
    except ScopeValidationError as exc:
        return "invalid", "scope_not_found", str(exc)
    return "valid", None, None


def classify_items_for_preview(
    workspace: Workspace,
    raw_items: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Classifica itens e monta entradas normalizadas com row_status.
    Retorna (normalized_items, conflicts, summary_counts dict base).
    """
    normalized: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    valid_n = 0
    invalid_n = 0

    for idx, item in enumerate(raw_items):
        st = item["subject_type"]
        sid = int(item["subject_id"])
        scopet = item["scope_type"]
        scope_uuid = uuid.UUID(str(item["scope_id"]))
        pkey = item["permission_key"]
        eff = item["effect"]

        row_status, reason_code, message = validate_bulk_item(
            workspace,
            subject_type=st,
            subject_id=sid,
            scope_type=scopet,
            scope_id=scope_uuid,
            permission_key=pkey,
            effect=eff,
        )
        norm = {
            "item_index": idx,
            "subject_type": st,
            "subject_id": sid,
            "scope_type": scopet,
            "scope_id": str(scope_uuid),
            "permission_key": pkey,
            "effect": eff,
            "row_status": row_status,
            "reason_code": reason_code,
            "message": message,
        }
        normalized.append(norm)
        if row_status == "valid":
            valid_n += 1
            try:
                user = User.objects.get(pk=sid)
            except User.DoesNotExist:
                continue
            prev = build_conflict_preview(
                workspace,
                user,
                scopet,
                scope_uuid,
                pkey,
                eff,
            )
            if prev.get("conflict") is not None:
                conflicts.append({"item_index": idx, **prev})
        else:
            invalid_n += 1

    summary = {
        "total": len(raw_items),
        "valid_count": valid_n,
        "invalid_count": invalid_n,
        "conflict_count": len(conflicts),
    }
    return normalized, conflicts, summary


def apply_bulk_preview(
    *,
    preview: PermissionBulkPreview,
    actor_id: int,
    correlation_id: str,
) -> dict[str, Any]:
    """
    Aplica apenas linhas com row_status=valid na snapshot; marca preview como applied.
    Deve ser chamado dentro de transacao com preview bloqueado (select_for_update).
    """
    payload = preview.items_json
    if not isinstance(payload, dict):
        raise InvalidPreviewPayloadError("Payload de preview invalido: formato inesperado.")

    items = payload.get("items")
    if not isinstance(items, list):
        raise InvalidPreviewPayloadError("Payload de preview invalido: items ausente ou invalido.")

    processed = len(items)
    succeeded = 0
    failures: list[dict[str, Any]] = []

    for row in items:
        if not isinstance(row, dict):
            failures.append(
                {
                    "item_index": None,
                    "reason_code": "invalid_row_payload",
                    "message": "Linha de preview invalida.",
                },
            )
            continue
        if row.get("row_status") != "valid":
            failures.append(
                {
                    "item_index": row.get("item_index"),
                    "reason_code": row.get("reason_code") or "invalid_row",
                    "message": row.get("message") or "Item invalido na previa.",
                },
            )
            continue
        try:
            scope_uuid = uuid.UUID(str(row["scope_id"]))
            subject_id = int(row["subject_id"])
            scope_type = str(row["scope_type"])
            permission_key = str(row["permission_key"])
            effect = str(row["effect"])
        except (KeyError, TypeError, ValueError):
            failures.append(
                {
                    "item_index": row.get("item_index"),
                    "reason_code": "invalid_row_payload",
                    "message": "Linha valida corrompida no preview.",
                },
            )
            continue

        try:
            user = User.objects.get(pk=subject_id)
        except User.DoesNotExist:
            failures.append(
                {
                    "item_index": row.get("item_index"),
                    "reason_code": "subject_not_found",
                    "message": "Usuario sujeito nao encontrado.",
                },
            )
            continue

        try:
            scope_belongs_to_workspace(preview.workspace, scope_type, scope_uuid)
        except ScopeValidationError as exc:
            failures.append(
                {
                    "item_index": row.get("item_index"),
                    "reason_code": "scope_not_found",
                    "message": str(exc),
                },
            )
            continue

        existing = PermissionAssignment.objects.filter(
            workspace=preview.workspace,
            subject=user,
            scope_type=scope_type,
            scope_id=scope_uuid,
            permission_key=permission_key,
        ).first()
        before_effect = existing.effect if existing is not None else None

        try:
            assignment, created = PermissionAssignment.objects.update_or_create(
                workspace=preview.workspace,
                subject=user,
                scope_type=scope_type,
                scope_id=scope_uuid,
                permission_key=permission_key,
                defaults={"effect": effect},
            )
        except IntegrityError:
            failures.append(
                {
                    "item_index": row.get("item_index"),
                    "reason_code": "assignment_conflict",
                    "message": "Conflito ao aplicar permissao.",
                },
            )
            continue

        succeeded += 1
        log_msg = (
            "iam.permission.assigned actor_id=%s correlation_id=%s workspace_id=%s "
            "subject_id=%s scope_type=%s scope_id=%s permission_key=%s effect=%s "
            "bulk_preview_id=%s created=%s assignment_id=%s before_effect=%s after_effect=%s"
        )
        logger.info(
            log_msg,
            str(actor_id),
            correlation_id,
            str(preview.workspace_id),
            user.pk,
            scope_type,
            str(scope_uuid),
            permission_key,
            effect,
            str(preview.pk),
            created,
            assignment.pk,
            before_effect,
            assignment.effect,
        )

    preview.status = PermissionBulkPreview.Status.APPLIED
    preview.save(update_fields=["status", "updated_at"])

    logger.info(
        "iam.permission.bulk_applied actor_id=%s correlation_id=%s workspace_id=%s "
        "preview_id=%s processed=%s succeeded=%s failed=%s",
        str(actor_id),
        correlation_id,
        str(preview.workspace_id),
        str(preview.pk),
        processed,
        succeeded,
        len(failures),
    )

    return {
        "preview_id": str(preview.pk),
        "processed": processed,
        "succeeded": succeeded,
        "failed": len(failures),
        "failures": failures,
    }


def create_preview_record(
    *,
    workspace: Workspace,
    created_by_id: int,
    normalized_items: list[dict[str, Any]],
    summary: dict[str, Any],
) -> PermissionBulkPreview:
    expires_at = timezone.now() + timedelta(seconds=_preview_ttl_seconds())
    return PermissionBulkPreview.objects.create(
        workspace=workspace,
        created_by_id=created_by_id,
        status=PermissionBulkPreview.Status.PENDING,
        expires_at=expires_at,
        items_json={"version": 1, "items": normalized_items},
        summary_json=summary,
    )
