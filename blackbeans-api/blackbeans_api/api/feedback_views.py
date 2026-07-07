from __future__ import annotations

import logging
import math
from uuid import UUID

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.feedback_serializers import ProblemReportFeedbackCreateSerializer
from blackbeans_api.api.feedback_serializers import ProblemReportUpdateSerializer
from blackbeans_api.api.feedback_serializers import problem_report_to_representation
from blackbeans_api.api.feedback_serializers import resolve_workspace_id
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.feedback.models import ProblemReport
from blackbeans_api.feedback.services import FeedbackDisabledError
from blackbeans_api.feedback.services import FeedbackRateLimitError
from blackbeans_api.feedback.services import FeedbackValidationError
from blackbeans_api.feedback.services import assert_feedback_enabled
from blackbeans_api.feedback.services import check_rate_limit
from blackbeans_api.feedback.services import feedback_disabled_http_status
from blackbeans_api.feedback.services import new_correlation_id
from blackbeans_api.feedback.services import validate_context_payload
from blackbeans_api.governance.models import Workspace

logger = logging.getLogger(__name__)


def _parse_positive_int(raw_value: str | None, default: int) -> int:
    if raw_value is None:
        return default
    parsed = int(raw_value)
    if parsed < 1:
        raise ValueError
    return parsed


def _resolve_workspace(workspace_id: UUID | None) -> Workspace | None:
    if workspace_id is None:
        return None
    return Workspace.objects.filter(pk=workspace_id).first()


class ProblemReportFeedbackCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)

        try:
            assert_feedback_enabled()
        except FeedbackDisabledError:
            return error_response(
                correlation_id=correlation_id,
                code="feedback_disabled",
                message="Modulo de relatar problema temporariamente indisponivel.",
                http_status=feedback_disabled_http_status(),
            )

        serializer = ProblemReportFeedbackCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Payload invalido.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        try:
            check_rate_limit(int(user.pk))
        except FeedbackRateLimitError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="rate_limit_exceeded",
                message=str(exc),
                http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        data = serializer.validated_data
        contexto = data.get("contexto") or {}
        try:
            contexto = validate_context_payload(contexto)
        except FeedbackValidationError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message=exc.message,
                details=exc.details,
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_id = resolve_workspace_id(data.get("workspace_id"))
        workspace = _resolve_workspace(workspace_id)
        report_correlation_id = (data.get("correlation_id") or "").strip() or new_correlation_id()
        url = str(contexto.get("url") or "")[:2048]

        report = ProblemReport.objects.create(
            user=user,
            workspace=workspace,
            title=data["titulo"],
            description=data["descricao"],
            steps=data.get("passos") or "",
            url=url,
            correlation_id=report_correlation_id,
            context_json=contexto,
        )

        logger.info(
            "feedback.created report_id=%s user_id=%s correlation_id=%s",
            report.id,
            user.pk,
            report_correlation_id,
        )

        return success_response(
            correlation_id=correlation_id,
            data={
                "id": str(report.id),
                "correlation_id": report.correlation_id,
            },
            http_status=status.HTTP_201_CREATED,
        )


class ProblemReportsListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)

        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter and status_filter not in {choice[0] for choice in ProblemReport.Status.choices}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtro de status invalido.",
                details={"status": ["Use novo, em_analise, resolvido ou descartado."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_filter = (request.query_params.get("workspace_id") or "").strip()
        workspace_uuid: UUID | None = None
        if workspace_filter:
            try:
                workspace_uuid = UUID(workspace_filter)
            except ValueError:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="workspace_id invalido.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            page = _parse_positive_int(request.query_params.get("page"), default=1)
            page_size = _parse_positive_int(request.query_params.get("page_size"), default=20)
        except ValueError:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Paginacao invalida.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = min(page_size, 100)
        search = (request.query_params.get("search") or "").strip()

        queryset = ProblemReport.objects.select_related("user", "workspace").all()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if workspace_uuid:
            queryset = queryset.filter(workspace_id=workspace_uuid)
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))

        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        offset = (page - 1) * page_size
        items = queryset[offset : offset + page_size]

        return success_response(
            correlation_id=correlation_id,
            data={
                "problem_reports": [
                    problem_report_to_representation(item, include_full_context=False) for item in items
                ],
            },
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
            },
        )


class ProblemReportDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, report_id: UUID):
        correlation_id = get_correlation_id(request)
        report = ProblemReport.objects.select_related("user", "workspace").filter(pk=report_id).first()
        if not report:
            return error_response(
                correlation_id=correlation_id,
                code="problem_report_not_found",
                message="Reporte nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            correlation_id=correlation_id,
            data={
                "problem_report": problem_report_to_representation(report, include_full_context=True),
            },
        )

    def patch(self, request: Request, report_id: UUID):
        correlation_id = get_correlation_id(request)
        report = ProblemReport.objects.filter(pk=report_id).first()
        if not report:
            return error_response(
                correlation_id=correlation_id,
                code="problem_report_not_found",
                message="Reporte nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProblemReportUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Payload invalido.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        if "status" in data:
            report.status = data["status"]
        if "notas_internas" in data:
            report.internal_notes = data["notas_internas"]
        report.save(update_fields=["status", "internal_notes", "updated_at"])

        report = ProblemReport.objects.select_related("user", "workspace").get(pk=report.pk)
        return success_response(
            correlation_id=correlation_id,
            data={
                "problem_report": problem_report_to_representation(report, include_full_context=True),
            },
        )

    def delete(self, request: Request, report_id: UUID):
        correlation_id = get_correlation_id(request)
        report = ProblemReport.objects.filter(pk=report_id).first()
        if not report:
            return error_response(
                correlation_id=correlation_id,
                code="problem_report_not_found",
                message="Reporte nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        report.delete()
        logger.info("feedback.deleted report_id=%s actor_id=%s", report_id, request.user.pk)
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "id": str(report_id)},
        )
