from __future__ import annotations

import math
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch
from django.db.models import Q
from rest_framework import status
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.leads_serializers import LeadCompanyCreateSerializer
from blackbeans_api.api.leads_serializers import LeadCompanyUpdateSerializer
from blackbeans_api.api.leads_serializers import LeadCreateSerializer
from blackbeans_api.api.leads_serializers import LeadUpdateSerializer
from blackbeans_api.api.leads_serializers import lead_company_to_representation
from blackbeans_api.api.leads_serializers import lead_import_to_representation
from blackbeans_api.api.leads_serializers import lead_to_representation
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.integrations.presenters import rd_info_by_company_ids
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.models import LeadImport
from blackbeans_api.leads.querysets import apply_quality_filters
from blackbeans_api.leads.querysets import company_list_queryset
from blackbeans_api.leads.scoring import QUALITY_BEST_THRESHOLD
from blackbeans_api.leads.scoring import compute_prospect_score
from blackbeans_api.leads.scoring import is_valid_cnpj
from blackbeans_api.leads.services import LeadParseError
from blackbeans_api.leads.services import build_company_search_text
from blackbeans_api.leads.services import build_search_text
from blackbeans_api.leads.services import get_or_create_company_for_payload
from blackbeans_api.leads.services import normalize_company_name
from blackbeans_api.leads.services import normalize_email
from blackbeans_api.leads.services import normalize_phone
from blackbeans_api.leads.services import parse_spreadsheet
from blackbeans_api.leads.services import recompute_company_quality
from blackbeans_api.leads.services import refresh_shared_quality

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


def _apply_quality_filters(queryset, request: Request):
    return apply_quality_filters(queryset, request.query_params)


def _lead_contacts_prefetch_qs(*, contact_status: str = ""):
    queryset = (
        Lead.objects.select_related("import_batch", "company")
        .defer("payload", "search_text")
        .order_by("-completeness_score", "display_name")
    )
    if contact_status:
        queryset = queryset.filter(contact_status=contact_status)
    return queryset


def _company_list_queryset(request: Request):
    return company_list_queryset(request.query_params)


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


class LeadCompaniesListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)

        freshness = (request.query_params.get("freshness") or "").strip()
        if freshness and freshness not in {c[0] for c in LeadCompany.Freshness.choices}:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtro freshness invalido.",
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

        try:
            page = _parse_positive_int(request.query_params.get("page"), default=1)
            page_size = _parse_positive_int(
                request.query_params.get("page_size"),
                default=20,
            )
            queryset = _company_list_queryset(request)
        except ValueError as exc:
            if str(exc) == "quality":
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Filtro quality invalido. Use best.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            if str(exc) == "rd_status":
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Filtro rd_status invalido.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Parametros invalidos.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = min(page_size, 100)
        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        offset = (page - 1) * page_size
        include_contacts = str(request.query_params.get("include_contacts") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        page_qs = queryset[offset : offset + page_size]
        if include_contacts:
            page_qs = page_qs.prefetch_related(
                Prefetch(
                    "contacts",
                    queryset=_lead_contacts_prefetch_qs(contact_status=contact_status),
                ),
            )
        items = list(page_qs)
        rd_map = rd_info_by_company_ids([item.pk for item in items])

        return success_response(
            correlation_id=correlation_id,
            data={
                "companies": [
                    lead_company_to_representation(
                        item,
                        include_contacts=include_contacts,
                        rd_info=rd_map.get(item.pk),
                    )
                    for item in items
                ],
            },
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
                "quality_best_threshold": QUALITY_BEST_THRESHOLD,
            },
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = LeadCompanyCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data
        cnpj = data.get("cnpj") or None
        if cnpj and LeadCompany.objects.filter(cnpj=cnpj).exists():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Ja existe empresa com este CNPJ.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        name = data["name"].strip()
        company = LeadCompany.objects.create(
            name=name,
            name_normalized=normalize_company_name(name),
            cnpj=cnpj,
            origem=(data.get("origem") or "").strip(),
            freshness=data.get("freshness") or LeadCompany.Freshness.NOVO,
            has_cnpj=bool(cnpj) and is_valid_cnpj(cnpj),
            notes=(data.get("notes") or "").strip(),
            completeness_score=0,
            search_text=build_company_search_text(
                name=name,
                cnpj=cnpj,
                origem=(data.get("origem") or "").strip(),
            ),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"company": lead_company_to_representation(company)},
            http_status=status.HTTP_201_CREATED,
        )


class LeadCompanyDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

    def get(self, request: Request, company_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            company = LeadCompany.objects.prefetch_related(
                Prefetch("contacts", queryset=_lead_contacts_prefetch_qs()),
            ).get(pk=company_id)
        except LeadCompany.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="company_not_found",
                message="Empresa nao encontrada.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"company": lead_company_to_representation(company, include_contacts=True)},
        )

    def patch(self, request: Request, company_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            company = LeadCompany.objects.get(pk=company_id)
        except LeadCompany.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="company_not_found",
                message="Empresa nao encontrada.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        serializer = LeadCompanyUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data
        update_fields = ["updated_at"]
        if "name" in data:
            company.name = data["name"].strip()
            company.name_normalized = normalize_company_name(company.name)
            update_fields.extend(["name", "name_normalized"])
        if "cnpj" in data:
            cnpj = data["cnpj"] or None
            if cnpj and LeadCompany.objects.filter(cnpj=cnpj).exclude(pk=company.pk).exists():
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Ja existe empresa com este CNPJ.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            company.cnpj = cnpj
            company.has_cnpj = bool(cnpj) and is_valid_cnpj(cnpj)
            update_fields.extend(["cnpj", "has_cnpj"])
        if "origem" in data:
            company.origem = (data["origem"] or "").strip()
            update_fields.append("origem")
        if "freshness" in data:
            company.freshness = data["freshness"]
            update_fields.append("freshness")
        if "notes" in data:
            company.notes = data["notes"]
            update_fields.append("notes")
        company.save(update_fields=update_fields)
        recompute_company_quality(company)
        company.refresh_from_db()
        return success_response(
            correlation_id=correlation_id,
            data={"company": lead_company_to_representation(company, include_contacts=True)},
        )

    def delete(self, request: Request, company_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            company = LeadCompany.objects.get(pk=company_id)
        except LeadCompany.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="company_not_found",
                message="Empresa nao encontrada.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        contacts_deleted, _ = company.contacts.all().delete()
        company.delete()
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "id": str(company_id), "deleted_contacts": contacts_deleted},
        )


class LeadsListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [JSONParser]

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
        company_id_raw = (request.query_params.get("company_id") or "").strip()
        import_uuid: UUID | None = None
        company_uuid: UUID | None = None
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
        if company_id_raw:
            try:
                company_uuid = UUID(company_id_raw)
            except ValueError:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="company_id invalido.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            page = _parse_positive_int(request.query_params.get("page"), default=1)
            page_size = _parse_positive_int(request.query_params.get("page_size"), default=20)
            queryset = Lead.objects.select_related("import_batch", "company").all()
            queryset = _apply_quality_filters(queryset, request)
        except ValueError as exc:
            if str(exc) == "quality":
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Filtro quality invalido. Use best.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Paginacao invalida.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = min(page_size, 100)
        q = (request.query_params.get("q") or request.query_params.get("search") or "").strip()

        if freshness:
            queryset = queryset.filter(
                Q(import_batch__freshness=freshness) | Q(company__freshness=freshness),
            )
        if contact_status:
            queryset = queryset.filter(contact_status=contact_status)
        if origem:
            queryset = queryset.filter(
                Q(import_batch__origem__iexact=origem) | Q(company__origem__iexact=origem),
            )
        if import_uuid:
            queryset = queryset.filter(import_batch_id=import_uuid)
        if company_uuid:
            queryset = queryset.filter(company_id=company_uuid)
        if q:
            queryset = queryset.filter(
                Q(search_text__icontains=q) | Q(display_name__icontains=q) | Q(notes__icontains=q),
            )

        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        offset = (page - 1) * page_size
        items = list(queryset[offset : offset + page_size])

        extra_keys: list[str] = []
        if import_uuid and items and items[0].import_batch:
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
                "quality_best_threshold": QUALITY_BEST_THRESHOLD,
            },
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = LeadCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Dados invalidos.",
                details=serializer.errors,
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data
        company: LeadCompany | None = None
        if data.get("company_id"):
            try:
                company = LeadCompany.objects.get(pk=data["company_id"])
            except LeadCompany.DoesNotExist:
                return error_response(
                    correlation_id=correlation_id,
                    code="company_not_found",
                    message="Empresa nao encontrada.",
                    http_status=status.HTTP_404_NOT_FOUND,
                )
        else:
            name = (data.get("company_name") or "").strip()
            cnpj = data.get("company_cnpj") or data.get("cnpj") or None
            if cnpj:
                company = LeadCompany.objects.filter(cnpj=cnpj).first()
            if company is None:
                name_norm = normalize_company_name(name)
                company = LeadCompany.objects.filter(name_normalized=name_norm).first() if name_norm else None
            if company is None:
                company = LeadCompany.objects.create(
                    name=name,
                    name_normalized=name_norm,
                    cnpj=cnpj or None,
                    origem=(data.get("origem") or "").strip(),
                    freshness=data.get("freshness") or LeadCompany.Freshness.NOVO,
                    has_cnpj=bool(cnpj) and is_valid_cnpj(cnpj),
                    search_text=build_company_search_text(
                        name=name,
                        cnpj=cnpj,
                        origem=(data.get("origem") or "").strip(),
                    ),
                )

        email = normalize_email(data.get("email") or "") or ""
        phone = normalize_phone(data.get("phone") or "") or ""
        cnpj = data.get("cnpj") or company.cnpj or ""
        display_name = data["display_name"].strip()
        job_title = (data.get("job_title") or "").strip()
        payload = {
            "nome": display_name,
            "email": email,
            "telefone": phone,
            "cnpj": cnpj,
            "empresa": company.name,
            "cargo": job_title,
        }
        quality = compute_prospect_score(
            cnpj=cnpj,
            email=email,
            phone=phone,
            contact_name=display_name,
            company_name=company.name,
            job_title=job_title,
        )
        lead = Lead.objects.create(
            company=company,
            payload=payload,
            display_name=display_name,
            email=email,
            phone=phone,
            cnpj=cnpj,
            job_title=job_title,
            has_cnpj=quality["has_cnpj"],
            has_email=quality["has_email"],
            has_phone=quality["has_phone"],
            completeness_score=quality["completeness_score"],
            email_is_generic=quality["email_is_generic"],
            email_is_shared=quality["email_is_shared"],
            phone_is_shared=quality["phone_is_shared"],
            contact_is_person=quality["contact_is_person"],
            contact_is_decision_maker=quality["contact_is_decision_maker"],
            contact_status=data.get("contact_status") or Lead.ContactStatus.NAO_CONTATADO,
            notes=(data.get("notes") or "").strip(),
            search_text=build_search_text(
                payload=payload,
                origem=company.origem,
                display_name=display_name,
            ),
        )
        refresh_shared_quality(emails=[email], phones=[phone])
        lead.refresh_from_db()
        return success_response(
            correlation_id=correlation_id,
            data={"lead": lead_to_representation(lead, include_payload=True)},
            http_status=status.HTTP_201_CREATED,
        )


class LeadDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, lead_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            lead = Lead.objects.select_related("import_batch", "company").get(pk=lead_id)
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
            lead = Lead.objects.select_related("import_batch", "company").get(pk=lead_id)
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
            lead = Lead.objects.select_related("import_batch", "company").get(pk=lead_id)
        except Lead.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="lead_not_found",
                message="Lead nao encontrado.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        batch = lead.import_batch
        company = lead.company
        email = lead.email
        phone = lead.phone
        lead.delete()
        if batch is not None:
            remaining = batch.leads.count()
            if batch.row_count != remaining:
                batch.row_count = remaining
                batch.save(update_fields=["row_count", "updated_at"])
        if company is not None:
            recompute_company_quality(company)
        refresh_shared_quality(emails=[email], phones=[phone])
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "id": str(lead_id)},
        )


class LeadOrigensView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        from_imports = set(
            LeadImport.objects.order_by("origem").values_list("origem", flat=True).distinct(),
        )
        from_companies = set(
            LeadCompany.objects.exclude(origem="")
            .order_by("origem")
            .values_list("origem", flat=True)
            .distinct(),
        )
        origens = sorted(from_imports | from_companies)
        return success_response(
            correlation_id=correlation_id,
            data={"origens": origens},
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
            company_cache: dict = {}
            lead_objs: list[Lead] = []
            touched_companies: dict[str, LeadCompany] = {}
            for payload in rows:
                company, enriched = get_or_create_company_for_payload(
                    payload=payload,
                    column_keys=column_keys,
                    origem=origem,
                    freshness=freshness,
                    cache=company_cache,
                )
                touched_companies[str(company.pk)] = company
                lead_objs.append(
                    Lead(
                        import_batch=batch,
                        company=company,
                        payload=payload,
                        display_name=enriched["display_name"],
                        email=enriched["email"],
                        phone=enriched["phone"],
                        cnpj=enriched["cnpj"],
                        has_cnpj=enriched["has_cnpj"],
                        has_phone=enriched["has_phone"],
                        has_email=enriched["has_email"],
                        completeness_score=enriched["completeness_score"],
                        email_is_generic=enriched["email_is_generic"],
                        email_is_shared=enriched["email_is_shared"],
                        phone_is_shared=enriched["phone_is_shared"],
                        contact_is_person=enriched["contact_is_person"],
                        contact_is_decision_maker=enriched["contact_is_decision_maker"],
                        job_title=enriched.get("job_title") or "",
                        search_text=build_search_text(
                            payload=payload,
                            origem=origem,
                            display_name=enriched["display_name"],
                        ),
                    ),
                )
            Lead.objects.bulk_create(lead_objs, batch_size=500)
        refresh_shared_quality(
            emails=[row.email for row in lead_objs],
            phones=[row.phone for row in lead_objs],
        )

        return success_response(
            correlation_id=correlation_id,
            data={
                "import": lead_import_to_representation(batch),
                "created_count": len(rows),
                "companies_touched": len(touched_companies),
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
        company_ids = list(
            batch.leads.exclude(company_id=None).values_list("company_id", flat=True).distinct(),
        )
        shared_emails = list(batch.leads.exclude(email="").values_list("email", flat=True))
        shared_phones = list(batch.leads.exclude(phone="").values_list("phone", flat=True))
        deleted_leads, _ = batch.leads.all().delete()
        batch.delete()
        for company in LeadCompany.objects.filter(pk__in=company_ids):
            recompute_company_quality(company)
        refresh_shared_quality(emails=shared_emails, phones=shared_phones)
        return success_response(
            correlation_id=correlation_id,
            data={"deleted": True, "deleted_leads": deleted_leads},
        )
