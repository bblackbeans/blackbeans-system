from __future__ import annotations

from typing import Any
from uuid import UUID

from rest_framework import serializers

from blackbeans_api.feedback.models import ProblemReport
from blackbeans_api.feedback.services import strip_media_from_context


class ProblemReportFeedbackCreateSerializer(serializers.Serializer):
    titulo = serializers.CharField(min_length=1, max_length=200)
    descricao = serializers.CharField(min_length=1, max_length=8000)
    passos = serializers.CharField(required=False, allow_blank=True, max_length=8000, default="")
    correlation_id = serializers.CharField(required=False, allow_blank=True, max_length=36, default="")
    workspace_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    contexto = serializers.DictField(required=False, default=dict)

    def validate_contexto(self, value: dict[str, Any]) -> dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Contexto deve ser um objeto JSON.")
        return value


class ProblemReportUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=ProblemReport.Status.choices,
        required=False,
    )
    notas_internas = serializers.CharField(required=False, allow_blank=True, max_length=8000)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError("Informe ao menos um campo para atualizar.")
        return attrs


def problem_report_to_representation(
    report: ProblemReport,
    *,
    include_full_context: bool = False,
) -> dict[str, Any]:
    user = report.user
    workspace = report.workspace
    context_json = report.context_json if include_full_context else strip_media_from_context(report.context_json or {})

    return {
        "id": str(report.id),
        "titulo": report.title,
        "descricao": report.description,
        "passos": report.steps,
        "origem": report.source,
        "status": report.status,
        "url": report.url,
        "correlation_id": report.correlation_id,
        "contexto_json": context_json,
        "has_screenshot": bool((report.context_json or {}).get("screenshot")),
        "has_recording": bool((report.context_json or {}).get("screen_recording")),
        "notas_internas": report.internal_notes,
        "usuario_id": user.pk if user else None,
        "usuario_nome": str(getattr(user, "name", "") or getattr(user, "email", "") or "") if user else None,
        "usuario_email": getattr(user, "email", None) if user else None,
        "workspace_id": str(workspace.pk) if workspace else None,
        "workspace_nome": workspace.name if workspace else None,
        "criado_em": report.created_at.isoformat() if report.created_at else None,
        "atualizado_em": report.updated_at.isoformat() if report.updated_at else None,
    }


def resolve_workspace_id(raw: UUID | str | None) -> UUID | None:
    if raw is None:
        return None
    return UUID(str(raw))
