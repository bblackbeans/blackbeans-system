from __future__ import annotations

import logging
import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.permissions import IsSuperuser
from blackbeans_api.api.permissions_serializers import BulkApplyRequestSerializer
from blackbeans_api.api.permissions_serializers import BulkPreviewRequestSerializer
from blackbeans_api.api.permissions_serializers import ConflictPreviewSerializer
from blackbeans_api.api.permissions_serializers import ConflictResolveSerializer
from blackbeans_api.api.permissions_serializers import PermissionAssignmentWriteSerializer
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import PermissionAssignment
from blackbeans_api.governance.models import PermissionBulkPreview
from blackbeans_api.governance.models import PermissionConflictResolution
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.services.bulk_permissions import apply_bulk_preview
from blackbeans_api.governance.services.bulk_permissions import classify_items_for_preview
from blackbeans_api.governance.services.bulk_permissions import create_preview_record
from blackbeans_api.governance.services.bulk_permissions import InvalidPreviewPayloadError
from blackbeans_api.governance.services.permissions import ScopeValidationError
from blackbeans_api.governance.services.permissions import apply_resolution_option
from blackbeans_api.governance.services.permissions import build_conflict_preview
from blackbeans_api.governance.services.permissions import matrix_rows_for_workspace
from blackbeans_api.governance.services.permissions import scope_belongs_to_workspace

User = get_user_model()

logger = logging.getLogger(__name__)


def _actor_id(request: Request) -> str:
    return str(request.user.pk)


class PermissionsMatrixView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        ws_raw = request.query_params.get("workspace_id")
        if not ws_raw:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="workspace_id e obrigatorio.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ws_uuid = uuid.UUID(str(ws_raw))
        except (ValueError, TypeError):
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="workspace_id invalido.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            workspace = Workspace.objects.get(pk=ws_uuid)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        user_id = request.query_params.get("user_id")
        uid: int | None = None
        if user_id is not None:
            try:
                uid = int(user_id)
            except (TypeError, ValueError):
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="user_id invalido.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
        st = request.query_params.get("scope_type")
        sid_raw = request.query_params.get("scope_id")
        if (st is None) ^ (sid_raw is None):
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe scope_type e scope_id juntos ou omita ambos.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        sid: uuid.UUID | None = None
        if sid_raw is not None:
            try:
                sid = uuid.UUID(str(sid_raw))
            except (ValueError, TypeError):
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="scope_id invalido.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                scope_belongs_to_workspace(workspace, st, sid)
            except ScopeValidationError as exc:
                return error_response(
                    correlation_id=correlation_id,
                    code="scope_not_found",
                    message=str(exc),
                    details={},
                    http_status=status.HTTP_404_NOT_FOUND,
                )

        rows = matrix_rows_for_workspace(workspace, user_id=uid, scope_type=st, scope_id=sid)
        return success_response(
            correlation_id=correlation_id,
            data={"matrix": rows},
            meta={"count": len(rows)},
        )


class PermissionAssignmentsView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser, IsSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        ser = PermissionAssignmentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data
        wuuid = vd["workspace_id"]
        try:
            workspace = Workspace.objects.get(pk=wuuid)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            scope_belongs_to_workspace(workspace, vd["scope_type"], vd["scope_id"])
        except ScopeValidationError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="scope_not_found",
                message=str(exc),
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            user = User.objects.get(pk=vd["subject_id"])
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="subject_not_found",
                message="Usuario sujeito nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        obj, created = PermissionAssignment.objects.update_or_create(
            workspace=workspace,
            subject=user,
            scope_type=vd["scope_type"],
            scope_id=vd["scope_id"],
            permission_key=vd["permission_key"],
            defaults={"effect": vd["effect"]},
        )

        logger.info(
            "iam.permission.assigned actor_id=%s correlation_id=%s workspace_id=%s "
            "subject_id=%s scope_type=%s scope_id=%s permission_key=%s effect=%s",
            _actor_id(request),
            correlation_id,
            str(workspace.pk),
            user.pk,
            vd["scope_type"],
            str(vd["scope_id"]),
            vd["permission_key"],
            vd["effect"],
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "assignment_id": obj.pk,
                "created": created,
            },
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PermissionConflictResolvePreviewView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        ser = ConflictPreviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data
        ctx = vd["context"]
        proposed = vd["proposed"]
        try:
            workspace = Workspace.objects.get(pk=vd["workspace_id"])
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            user = User.objects.get(pk=ctx["subject_id"])
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="subject_not_found",
                message="Sujeito nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            scope_belongs_to_workspace(workspace, ctx["scope_type"], ctx["scope_id"])
        except ScopeValidationError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="scope_not_found",
                message=str(exc),
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        preview = build_conflict_preview(
            workspace,
            user,
            ctx["scope_type"],
            ctx["scope_id"],
            ctx["permission_key"],
            proposed["effect"],
        )
        return success_response(correlation_id=correlation_id, data=preview)


class PermissionConflictResolveView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser, IsSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        ser = ConflictResolveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data
        ctx = vd["context"]
        proposed = vd["proposed"]
        option_id = vd["option_id"]

        try:
            workspace = Workspace.objects.get(pk=vd["workspace_id"])
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            user = User.objects.get(pk=ctx["subject_id"])
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="subject_not_found",
                message="Sujeito nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            scope_belongs_to_workspace(workspace, ctx["scope_type"], ctx["scope_id"])
        except ScopeValidationError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="scope_not_found",
                message=str(exc),
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        before, after = apply_resolution_option(
            workspace,
            user,
            ctx["scope_type"],
            ctx["scope_id"],
            ctx["permission_key"],
            proposed["effect"],
            option_id,
        )

        PermissionConflictResolution.objects.create(
            workspace=workspace,
            actor=request.user,
            option_id=option_id,
            context_summary=f"{ctx['scope_type']}/{ctx['scope_id']}/{ctx['permission_key']}",
            before_summary=before,
            after_summary=after,
        )

        logger.info(
            "iam.permission.conflict_resolved actor_id=%s correlation_id=%s workspace_id=%s "
            "option_id=%s before=%s after=%s",
            _actor_id(request),
            correlation_id,
            str(workspace.pk),
            option_id,
            before,
            after,
        )

        return success_response(
            correlation_id=correlation_id,
            data={
                "option_id": option_id,
                "before_summary": before,
                "after_summary": after,
            },
        )


def _bulk_item_public(row: dict) -> dict:
    out = {
        "item_index": row["item_index"],
        "subject_type": row["subject_type"],
        "subject_id": row["subject_id"],
        "scope_type": row["scope_type"],
        "scope_id": row["scope_id"],
        "permission_key": row["permission_key"],
        "effect": row["effect"],
    }
    if row.get("row_status") == "invalid":
        out["reason_code"] = row.get("reason_code")
        out["message"] = row.get("message")
    return out


class PermissionBulkPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser, IsSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        ser = BulkPreviewRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data
        wuuid = vd["workspace_id"]
        try:
            workspace = Workspace.objects.get(pk=wuuid)
        except Workspace.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="workspace_not_found",
                message="Workspace nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        raw_items = list(vd["items"])
        normalized, conflicts, summary = classify_items_for_preview(
            workspace,
            raw_items,
        )
        preview = create_preview_record(
            workspace=workspace,
            created_by_id=request.user.pk,
            normalized_items=normalized,
            summary=summary,
        )

        valid_items = [
            _bulk_item_public(r) for r in normalized if r["row_status"] == "valid"
        ]
        invalid_items = [
            _bulk_item_public(r) for r in normalized if r["row_status"] == "invalid"
        ]

        log_preview = (
            "iam.permission.bulk_preview_created actor_id=%s correlation_id=%s "
            "workspace_id=%s preview_id=%s valid_count=%s invalid_count=%s conflict_count=%s"
        )
        logger.info(
            log_preview,
            _actor_id(request),
            correlation_id,
            str(workspace.pk),
            str(preview.pk),
            summary["valid_count"],
            summary["invalid_count"],
            summary["conflict_count"],
        )

        return success_response(
            correlation_id=correlation_id,
            data={
                "preview_id": str(preview.pk),
                "valid_items": valid_items,
                "invalid_items": invalid_items,
                "conflicts": conflicts,
                "summary": summary,
            },
            meta={"expires_at": preview.expires_at.isoformat()},
        )


class PermissionBulkApplyView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser, IsSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        ser = BulkApplyRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        preview_uuid = ser.validated_data["preview_id"]

        try:
            with transaction.atomic():
                locked = PermissionBulkPreview.objects.select_for_update()
                preview = locked.get(pk=preview_uuid)
                if preview.created_by_id != request.user.pk:
                    return error_response(
                        correlation_id=correlation_id,
                        code="forbidden",
                        message="Apenas o criador deste preview pode aplicar o lote.",
                        details={},
                        http_status=status.HTTP_403_FORBIDDEN,
                    )
                if preview.status == PermissionBulkPreview.Status.APPLIED:
                    return error_response(
                        correlation_id=correlation_id,
                        code="preview_already_applied",
                        message="Este preview ja foi aplicado.",
                        details={},
                        http_status=status.HTTP_409_CONFLICT,
                    )
                if preview.status == PermissionBulkPreview.Status.EXPIRED:
                    return error_response(
                        correlation_id=correlation_id,
                        code="preview_expired",
                        message="Preview expirado.",
                        details={},
                        http_status=status.HTTP_409_CONFLICT,
                    )
                if preview.expires_at <= timezone.now():
                    preview.status = PermissionBulkPreview.Status.EXPIRED
                    preview.save(update_fields=["status", "updated_at"])
                    return error_response(
                        correlation_id=correlation_id,
                        code="preview_expired",
                        message="Preview expirado.",
                        details={},
                        http_status=status.HTTP_409_CONFLICT,
                    )
                if preview.status != PermissionBulkPreview.Status.PENDING:
                    return error_response(
                        correlation_id=correlation_id,
                        code="preview_invalid_state",
                        message="Preview nao pode ser aplicado.",
                        details={},
                        http_status=status.HTTP_409_CONFLICT,
                    )
                result = apply_bulk_preview(
                    preview=preview,
                    actor_id=request.user.pk,
                    correlation_id=correlation_id,
                )
        except InvalidPreviewPayloadError:
            return error_response(
                correlation_id=correlation_id,
                code="preview_invalid_state",
                message="Preview invalido para aplicacao.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        except PermissionBulkPreview.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="preview_not_found",
                message="Preview nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(correlation_id=correlation_id, data=result, meta={})
