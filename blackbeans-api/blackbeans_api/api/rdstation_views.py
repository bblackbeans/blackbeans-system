from __future__ import annotations

import json
from uuid import UUID

from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request  # noqa: TC002
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.rdstation_serializers import RdSettingsUpdateSerializer
from blackbeans_api.api.rdstation_serializers import RdSyncCreateSerializer
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.integrations.client import RdAuthError
from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.client import as_list
from blackbeans_api.integrations.jobs import create_sync_job
from blackbeans_api.integrations.jobs import job_to_dict
from blackbeans_api.integrations.jobs import preview_sync
from blackbeans_api.integrations.models import IntegrationSettings
from blackbeans_api.integrations.models import RdSyncJob
from blackbeans_api.integrations.models import RdSyncLog
from blackbeans_api.integrations.oauth import build_authorization_url
from blackbeans_api.integrations.oauth import connected_client
from blackbeans_api.integrations.oauth import disconnect
from blackbeans_api.integrations.oauth import exchange_code
from blackbeans_api.integrations.oauth import frontend_redirect
from blackbeans_api.integrations.oauth import get_credential
from blackbeans_api.integrations.oauth import get_settings
from blackbeans_api.integrations.oauth import is_connected
from blackbeans_api.integrations.oauth import oauth_configured
from blackbeans_api.integrations.tasks import process_rd_webhook_event
from blackbeans_api.integrations.tasks import start_rd_sync_job
from blackbeans_api.integrations.webhooks import ensure_webhooks
from blackbeans_api.integrations.webhooks import ingest_webhook
from blackbeans_api.integrations.webhooks import validate_webhook_header


def _iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def _settings_payload(cfg: IntegrationSettings) -> dict:
    return {
        "create_deals": cfg.create_deals,
        "pipeline_id": cfg.pipeline_id,
        "stage_id": cfg.stage_id,
        "owner_id": cfg.owner_id,
        "source_id": cfg.source_id,
        "min_score_for_deal": cfg.min_score_for_deal,
        "only_contacts_with_email_or_phone": cfg.only_contacts_with_email_or_phone,
        "cnpj_custom_field_slug": cfg.cnpj_custom_field_slug,
        "legal_bases": cfg.legal_bases or [],
        "webhook_registered": cfg.webhook_registered,
        "webhook_header_name": cfg.webhook_header_name,
    }


class RdStatusView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        cred = get_credential()
        cfg = get_settings()
        return success_response(
            correlation_id=correlation_id,
            data={
                "connected": is_connected(),
                "oauth_configured": oauth_configured(),
                "connected_at": _iso(cred.connected_at) if cred else None,
                "expires_at": _iso(cred.access_expires_at) if cred else None,
                "settings": _settings_payload(cfg),
            },
        )


class RdOAuthStartView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        try:
            url = build_authorization_url(user=request.user)
        except RdAuthError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="rd_oauth_not_configured",
                message=str(exc),
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"authorization_url": url},
        )


class RdOAuthCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Request):
        code = (request.query_params.get("code") or "").strip()
        state = (request.query_params.get("state") or "").strip()
        if not code or not state:
            return HttpResponseRedirect(frontend_redirect("oauth_error"))
        try:
            exchange_code(code, state)
            ensure_webhooks()
        except (RdAuthError, RdHttpError):
            return HttpResponseRedirect(frontend_redirect("oauth_error"))
        return HttpResponseRedirect(frontend_redirect("connected"))


class RdOAuthDisconnectView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        disconnect()
        return success_response(
            correlation_id=correlation_id,
            data={"connected": False},
        )


class RdSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        return success_response(
            correlation_id=correlation_id,
            data={"settings": _settings_payload(get_settings())},
        )

    def patch(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = RdSettingsUpdateSerializer(data=request.data or {})
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        cfg = get_settings()
        data = serializer.validated_data
        for field, value in data.items():
            setattr(cfg, field, value)
        cfg.save()
        return success_response(
            correlation_id=correlation_id,
            data={"settings": _settings_payload(cfg)},
        )


def _option_items(rows: list[dict]) -> list[dict]:
    items = []
    for row in rows:
        item_id = str(row.get("id") or row.get("_id") or "")
        name = str(row.get("name") or row.get("email") or item_id)
        if item_id:
            items.append({"id": item_id, "name": name, "raw": row})
    return items


def _try_list(client, path: str, **kwargs) -> tuple[list[dict], str | None]:
    try:
        return as_list(client.get(path, **kwargs)), None
    except RdHttpError as exc:
        return [], str(exc)


def _pipeline_stages(client, pipeline_id: str) -> list[dict]:
    rows, _error = _try_list(client, f"/pipelines/{pipeline_id}/stages")
    stages = []
    for row in rows:
        stage_id = str(row.get("id") or row.get("_id") or "")
        if not stage_id:
            continue
        stages.append(
            {
                "id": stage_id,
                "name": str(row.get("name") or stage_id),
                "pipeline_id": pipeline_id,
            },
        )
    return stages


class RdOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        if not is_connected():
            return error_response(
                correlation_id=correlation_id,
                code="rd_not_connected",
                message="Conecte o RD Station CRM para carregar pipelines e donos.",
                http_status=status.HTTP_409_CONFLICT,
            )
        client = connected_client()
        pipeline_rows, pipeline_error = _try_list(client, "/pipelines")
        pipelines = _option_items(pipeline_rows)
        user_rows, user_error = _try_list(client, "/users")
        users = _option_items(user_rows)
        source_rows, source_error = _try_list(client, "/sources")
        if source_error:
            source_rows, source_error = _try_list(client, "/deal_sources")
        sources = _option_items(source_rows)
        field_rows, field_error = _try_list(
            client, "/custom_fields", query={"entity": "organization"},
        )
        custom_fields = []
        for row in field_rows:
            entity = str(row.get("entity") or "").strip().lower()
            if entity and entity != "organization":
                continue
            slug = str(row.get("slug") or "").strip()
            if not slug:
                continue
            custom_fields.append(
                {
                    "slug": slug,
                    "name": str(row.get("label") or row.get("name") or slug),
                },
            )
        stages = []
        for pipeline in pipelines[:20]:
            stages.extend(_pipeline_stages(client, pipeline["id"]))
        errors = {
            key: message
            for key, message in {
                "pipelines": pipeline_error,
                "owners": user_error,
                "sources": source_error,
                "custom_fields": field_error,
            }.items()
            if message
        }
        return success_response(
            correlation_id=correlation_id,
            data={
                "pipelines": [{"id": p["id"], "name": p["name"]} for p in pipelines],
                "stages": stages,
                "owners": [{"id": u["id"], "name": u["name"]} for u in users],
                "sources": [{"id": s["id"], "name": s["name"]} for s in sources],
                "custom_fields": custom_fields,
                "errors": errors,
            },
        )


class RdSyncPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        raw_ids = (request.query_params.get("company_ids") or "").strip()
        company_ids = []
        if raw_ids:
            try:
                company_ids = [
                    UUID(part.strip())
                    for part in raw_ids.split(",")
                    if part.strip()
                ]
            except ValueError:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="company_ids invalidos.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
        try:
            data = preview_sync(
                params=request.query_params,
                company_ids=company_ids,
                select_all_matching=not company_ids,
            )
        except ValueError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtros invalidos.",
                details={"reason": str(exc)},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        data["connected"] = is_connected()
        return success_response(correlation_id=correlation_id, data=data)


class RdSyncCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        if not is_connected():
            return error_response(
                correlation_id=correlation_id,
                code="rd_not_connected",
                message="Conecte o RD Station CRM antes de enviar.",
                http_status=status.HTTP_409_CONFLICT,
            )
        serializer = RdSyncCreateSerializer(data=request.data or {})
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos para envio.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data
        job = create_sync_job(
            params=request.query_params,
            company_ids=list(data.get("company_ids") or []),
            select_all_matching=bool(data.get("select_all_matching")),
            force_resync=bool(data.get("force_resync")),
            user=request.user,
        )
        if job.total:
            start_rd_sync_job.delay(str(job.pk))
        else:
            job.status = "done"
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "finished_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"job": job_to_dict(job)},
            http_status=status.HTTP_201_CREATED,
        )


class RdSyncJobDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, job_id: UUID):
        correlation_id = get_correlation_id(request)
        job = RdSyncJob.objects.filter(pk=job_id).first()
        if job is None:
            return error_response(
                correlation_id=correlation_id,
                code="job_not_found",
                message="Job nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"job": job_to_dict(job)},
        )


class RdCompanySyncView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

    def post(self, request: Request, company_id: UUID):
        correlation_id = get_correlation_id(request)
        if not is_connected():
            return error_response(
                correlation_id=correlation_id,
                code="rd_not_connected",
                message="Conecte o RD Station CRM antes de enviar.",
                http_status=status.HTTP_409_CONFLICT,
            )
        payload = request.data if isinstance(request.data, dict) else {}
        raw_force = payload.get("force_resync")
        force = raw_force is True or str(raw_force or "").lower() in {
            "1",
            "true",
            "yes",
        }
        job = create_sync_job(
            params=request.query_params,
            company_ids=[company_id],
            select_all_matching=False,
            force_resync=force,
            user=request.user,
        )
        if job.total:
            start_rd_sync_job.delay(str(job.pk))
        else:
            job.status = "done"
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "finished_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"job": job_to_dict(job)},
            http_status=status.HTTP_201_CREATED,
        )


class RdHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = RdSyncLog.objects.all()
        company_id = (request.query_params.get("company_id") or "").strip()
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        rows = list(queryset[:100])
        return success_response(
            correlation_id=correlation_id,
            data={
                "logs": [
                    {
                        "id": str(row.pk),
                        "company_id": str(row.company_id) if row.company_id else None,
                        "action": row.action,
                        "success": row.success,
                        "message": row.message,
                        "extra": row.extra,
                        "created_at": _iso(row.created_at),
                    }
                    for row in rows
                ],
            },
        )


class RdWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        if not validate_webhook_header(request):
            return error_response(
                correlation_id=correlation_id,
                code="webhook_unauthorized",
                message="Webhook nao autorizado.",
                http_status=status.HTTP_401_UNAUTHORIZED,
            )
        payload = request.data if isinstance(request.data, dict) else {}
        raw = b""
        try:
            raw = json.dumps(payload, sort_keys=True).encode()
        except (TypeError, ValueError):
            raw = b""
        event, created = ingest_webhook(payload, raw)
        if created:
            process_rd_webhook_event.delay(str(event.pk))
        return success_response(
            correlation_id=correlation_id,
            data={"accepted": True, "duplicate": not created},
        )
