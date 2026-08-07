from __future__ import annotations

import math
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.parsers import FormParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.leads_serializers import LeadUpdateSerializer
from blackbeans_api.api.leads_serializers import lead_import_to_representation
from blackbeans_api.api.leads_serializers import lead_to_representation
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadImport
from blackbeans_api.leads.services import LeadParseError
from blackbeans_api.leads.services import build_search_text
from blackbeans_api.leads.services import derive_display_name
from blackbeans_api.leads.services import parse_spreadsheet

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
PREVIEW_ROWS = 5
ALLOWED_EXTENSIONS = {".csv", ".txt", ".xlsx", ".xlsm"}


def _parse_positive_int(raw_value: str | None, default: int) -> int:
    if raw_value is None:
        return default
    parsed = int(raw_value)
    if parsed < 1:
        raise ValueError
    return parsed


def _read_upload(request: Request, correlation_id: str):
    uploaded = request.FILES.get("file")
    if uploaded is None:
        return None, error_response(
            correlation_id=correlation_id,
            code="validation_error",
            message="Arquivo obrigatorio (campo file).",
            http_status=status.HTTP_400_BAD_REQUEST,
        )
    filename = getattr(uploaded, "name", "") or "upload"
    lower = filename.lower()
    if not any(lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        return None, error_response(
            correlation_id=correlation_id,
            code="validation_error",
            message="Formato invalido. Use CSV ou XLSX.",
            details={"file": ["Extensoes aceitas: .csv, .xlsx"]},
            http_status=status.HTTP_400_BAD_REQUEST,
        )
    size = int(getattr(uploaded, "size", 0) or 0)
    if size > MAX_UPLOAD_BYTES:
        return None, error_response(
            correlation_id=correlation_id,
            code="validation_error",
            message="Arquivo excede o limite de 15MB.",
            http_status=status.HTTP_400_BAD_REQUEST,
        )
    content = uploaded.read()
    return (filename, content), None


class LeadsListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)

        freshness = (request.query_params.get("freshness") or "").strip()
        if freshness and freshness not in {c[0] for c in LeadImport.Freshness.choices}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtro freshness invalido.",
                details={"freshness": ["Use novo ou antigo."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        contact_status = (request.query_params.get("contact_status") or "").strip()
        if contact_status and contact_status not in {c[0] for c in Lead.ContactStatus.choices}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtro contact_status invalido.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        origem = (request.query_params.get("origem") or "").strip()
        import_id_raw = (request.query_params.get("import_id") or "").strip()
        import_uuid: UUID | None = None
        if import_id_raw:
            try:
                import_uuid = UUID(import_id_raw)
            except ValueError:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="import_id invalido.",
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
        q = (request.query_params.get("q") or request.query_params.get("search") or "").strip()

        queryset = Lead.objects.select_related("import_batch").all()
        if freshness:
            queryset = queryset.filter(import_batch__freshness=freshness)
        if contact_status:
            queryset = queryset.filter(contact_status=contact_status)
        if origem:
            queryset = queryset.filter(import_batch__origem__iexact=origem)
        if import_uuid:
            queryset = queryset.filter(import_batch_id=import_uuid)
        if q:
            queryset = queryset.filter(
                Q(search_text__icontains=q) | Q(display_name__icontains=q) | Q(notes__icontains=q),
            )

        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        offset = (page - 1) * page_size
        items = list(queryset[offset : offset + page_size])

        extra_keys: list[str] = []
        if import_uuid and items:
            extra_keys = list(items[0].import_batch.column_keys or [])[:4]
        elif origem:
            batch = (
                LeadImport.objects.filter(origem__iexact=origem)
                .order_by("-created_at")
                .first()
            )
            if batch:
                extra_keys = list(batch.column_keys or [])[:4]

        return success_response(
            correlation_id=correlation_id,
            data={
                "leads": [lead_to_representation(item, include_payload=False) for item in items],
                "extra_column_keys": extra_keys,
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


class LeadDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, lead_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            lead = Lead.objects.select_related("import_batch").get(pk=lead_id)
        except Lead.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="lead_not_found",
                message="Lead nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"lead": lead_to_representation(lead, include_payload=True)},
        )

    def patch(self, request: Request, lead_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            lead = Lead.objects.select_related("import_batch").get(pk=lead_id)
        except Lead.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="lead_not_found",
                message="Lead nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = LeadUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields: list[str] = ["updated_at"]
        if "contact_status" in serializer.validated_data:
            lead.contact_status = serializer.validated_data["contact_status"]
            update_fields.append("contact_status")
        if "notes" in serializer.validated_data:
            lead.notes = serializer.validated_data["notes"]
            update_fields.append("notes")
        lead.save(update_fields=update_fields)

        return success_response(
            correlation_id=correlation_id,
            data={"lead": lead_to_representation(lead, include_payload=True)},
        )

    def delete(self, request: Request, lead_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            lead = Lead.objects.select_related("import_batch").get(pk=lead_id)
        except Lead.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="lead_not_found",
                message="Lead nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        batch = lead.import_batch
        lead.delete()
        remaining = batch.leads.count()
        if batch.row_count != remaining:
            batch.row_count = remaining
            batch.save(update_fields=["row_count", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "id": str(lead_id)},
        )


class LeadOrigensView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        origens = (
            LeadImport.objects.order_by("origem")
            .values_list("origem", flat=True)
            .distinct()
        )
        return success_response(
            correlation_id=correlation_id,
            data={"origens": list(origens)},
        )


class LeadImportPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        upload, err = _read_upload(request, correlation_id)
        if err is not None:
            return err
        filename, content = upload
        try:
            column_keys, rows = parse_spreadsheet(filename=filename, content=content)
        except LeadParseError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="parse_error",
                message=str(exc),
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        sample = rows[:PREVIEW_ROWS]
        return success_response(
            correlation_id=correlation_id,
            data={
                "filename": filename,
                "column_keys": column_keys,
                "row_count": len(rows),
                "preview_rows": sample,
            },
        )


class LeadImportsListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        try:
            page = _parse_positive_int(request.query_params.get("page"), default=1)
            page_size = _parse_positive_int(request.query_params.get("page_size"), default=50)
        except ValueError:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Paginacao invalida.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        page_size = min(page_size, 100)
        queryset = LeadImport.objects.all()
        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        offset = (page - 1) * page_size
        items = list(queryset[offset : offset + page_size])
        return success_response(
            correlation_id=correlation_id,
            data={"imports": [lead_import_to_representation(item) for item in items]},
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
            },
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        origem = (request.data.get("origem") or "").strip()
        freshness = (request.data.get("freshness") or "").strip().lower()

        if not origem:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe a origem dos leads.",
                details={"origem": ["Obrigatorio."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if len(origem) > 200:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Origem muito longa (max 200).",
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if freshness not in {c[0] for c in LeadImport.Freshness.choices}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Freshness invalido. Use novo ou antigo.",
                details={"freshness": ["Use novo ou antigo."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        upload, err = _read_upload(request, correlation_id)
        if err is not None:
            return err
        filename, content = upload

        try:
            column_keys, rows = parse_spreadsheet(filename=filename, content=content)
        except LeadParseError as exc:
            return error_response(
                correlation_id=correlation_id,
                code="parse_error",
                message=str(exc),
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            batch = LeadImport.objects.create(
                origem=origem,
                freshness=freshness,
                filename=filename,
                column_keys=column_keys,
                row_count=len(rows),
                created_by=request.user if request.user.is_authenticated else None,
            )
            lead_objs: list[Lead] = []
            for payload in rows:
                display_name = derive_display_name(payload, column_keys)
                search_text = build_search_text(
                    payload=payload,
                    origem=origem,
                    display_name=display_name,
                )
                lead_objs.append(
                    Lead(
                        import_batch=batch,
                        payload=payload,
                        display_name=display_name,
                        search_text=search_text,
                    ),
                )
            Lead.objects.bulk_create(lead_objs, batch_size=500)

        return success_response(
            correlation_id=correlation_id,
            data={
                "import": lead_import_to_representation(batch),
                "created_count": len(rows),
            },
            http_status=status.HTTP_201_CREATED,
        )


class LeadImportDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def delete(self, request: Request, import_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            batch = LeadImport.objects.get(pk=import_id)
        except LeadImport.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="import_not_found",
                message="Importacao nao encontrada.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        deleted_leads = batch.leads.count()
        batch.delete()
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "deleted_leads": deleted_leads},
        )
