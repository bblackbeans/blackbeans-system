from __future__ import annotations

import logging
import mimetypes
import re
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.client_portal_auth import ClientPortalJWTAuthentication
from blackbeans_api.api.client_portal_auth import ClientPortalPrincipal
from blackbeans_api.api.client_portal_auth import IsClientPortal
from blackbeans_api.api.client_portal_auth import issue_client_portal_access_token
from blackbeans_api.api.client_requests_views import ALLOWED_AUDIO_TYPES
from blackbeans_api.api.client_requests_views import ALLOWED_EXTENSIONS
from blackbeans_api.api.client_requests_views import ALLOWED_FILE_TYPES
from blackbeans_api.api.client_requests_views import ALLOWED_IMAGE_TYPES
from blackbeans_api.api.client_requests_views import MAX_ATTACHMENT_BYTES
from blackbeans_api.api.client_requests_views import MAX_ATTACHMENTS
from blackbeans_api.api.client_requests_views import _collect_upload_files
from blackbeans_api.api.client_requests_views import _guess_kind
from blackbeans_api.api.client_requests_views import client_request_to_representation
from blackbeans_api.api.operations_serializers import task_attachment_to_representation
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import ClientRequest
from blackbeans_api.governance.models import ClientRequestAttachment
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.notification_service import get_user_display_name
from blackbeans_api.api.operations_serializers import project_to_representation

logger = logging.getLogger(__name__)

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _portal_client(request: Request) -> Client:
    principal = request.user
    assert isinstance(principal, ClientPortalPrincipal)
    return principal.client


def _strip_html(value: str) -> str:
    text = _HTML_TAG_RE.sub(" ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def _effective_review_status(item: ClientRequest) -> str:
    current = (item.client_review_status or "none").strip() or "none"
    if current == "approved":
        return "approved"
    if current == "revision_requested":
        return "revision_requested"
    task = item.converted_task
    if task is not None and str(task.status).lower() == "done":
        return "awaiting_client"
    return current if current != "awaiting_client" else "none"


def _portal_display_status(item: ClientRequest, review_status: str) -> str:
    if review_status == "approved":
        return "approved"
    if review_status == "revision_requested":
        return "revision_requested"
    if review_status == "awaiting_client":
        return "completed"
    if item.status == ClientRequest.Status.REJECTED:
        return "rejected"
    if item.status == ClientRequest.Status.CONVERTED:
        return "in_progress"
    if item.status == ClientRequest.Status.IN_REVIEW:
        return "in_review"
    return "new"


def portal_request_to_representation(item: ClientRequest, *, include_feedback: bool = False) -> dict:
    base = client_request_to_representation(item)
    task = item.converted_task
    review_status = _effective_review_status(item)
    display_status = _portal_display_status(item, review_status)
    can_review = review_status == "awaiting_client"
    review_locked = review_status == "approved"

    feedback: list[dict] = []
    if include_feedback and task is not None:
        comments = (
            TaskComment.objects.filter(task=task)
            .select_related("author")
            .prefetch_related("attachments")
            .order_by("-created_at")[:50]
        )
        for comment in comments:
            attachments = [
                task_attachment_to_representation(att)
                for att in comment.attachments.all()
            ]
            feedback.append(
                {
                    "id": str(comment.pk),
                    "author_name": get_user_display_name(comment.author) if comment.author else "Equipe",
                    "content": comment.content,
                    "content_text": _strip_html(comment.content),
                    "created_at": comment.created_at.isoformat().replace("+00:00", "Z"),
                    "attachments": attachments,
                },
            )

    base.update(
        {
            "display_status": display_status,
            "client_review_status": review_status,
            "can_review": can_review,
            "review_locked": review_locked,
            "task_status": task.status if task is not None else None,
            "task_title": task.title if task is not None else None,
            "feedback": feedback,
            "feedback_count": (
                TaskComment.objects.filter(task=task).count() if task is not None else 0
            ),
        },
    )
    return base


def _get_client_request_or_404(client: Client, request_id: UUID, correlation_id: str):
    try:
        return (
            ClientRequest.objects.select_related("converted_task")
            .prefetch_related("attachments")
            .filter(client=client)
            .get(pk=request_id)
        )
    except ClientRequest.DoesNotExist:
        return error_response(
            correlation_id=correlation_id,
            code="request_not_found",
            message="Pedido nao encontrado.",
            details={},
            http_status=status.HTTP_404_NOT_FOUND,
        )


def _validate_uploads(uploads: list, correlation_id: str):
    if len(uploads) > MAX_ATTACHMENTS:
        return error_response(
            correlation_id=correlation_id,
            code="validation_error",
            message=f"No maximo {MAX_ATTACHMENTS} anexos por pedido.",
            details={},
            http_status=status.HTTP_400_BAD_REQUEST,
        )
    for upload in uploads:
        size = int(getattr(upload, "size", 0) or 0)
        if size > MAX_ATTACHMENT_BYTES:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message=f"Arquivo excede 10 MB: {getattr(upload, 'name', 'arquivo')}",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        filename = str(getattr(upload, "name", "") or "arquivo")
        content_type = str(getattr(upload, "content_type", "") or "")
        if not content_type:
            guessed, _ = mimetypes.guess_type(filename)
            content_type = guessed or "application/octet-stream"
        ext = ""
        if "." in filename:
            ext = "." + filename.rsplit(".", 1)[-1].lower()
        kind = _guess_kind(content_type, filename)
        ct_base = content_type.split(";")[0].strip().lower()
        if kind == ClientRequestAttachment.Kind.AUDIO:
            if ct_base.startswith("video/") or ct_base in {"application/octet-stream", ""}:
                if filename.lower().endswith(".ogg"):
                    content_type = "audio/ogg"
                elif filename.lower().endswith((".m4a", ".mp4")):
                    content_type = "audio/mp4"
                elif filename.lower().endswith((".mp3", ".mpeg")):
                    content_type = "audio/mpeg"
                else:
                    content_type = "audio/webm"
                ct_base = content_type
        allowed = (
            (kind == ClientRequestAttachment.Kind.IMAGE and ct_base in ALLOWED_IMAGE_TYPES)
            or (
                kind == ClientRequestAttachment.Kind.AUDIO
                and (ct_base in ALLOWED_AUDIO_TYPES or ct_base.startswith("audio/"))
            )
            or (
                kind == ClientRequestAttachment.Kind.FILE
                and (ct_base in ALLOWED_FILE_TYPES or ct_base.startswith("text/"))
            )
            or (ext in ALLOWED_EXTENSIONS)
        )
        if not allowed:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message=f"Tipo de arquivo nao permitido: {filename}",
                details={"content_type": content_type},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
    return None


class ClientPortalLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        username = str(request.data.get("username") or "").strip()
        password = str(request.data.get("password") or "")
        if not username or not password:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe usuario e senha.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        client = Client.objects.filter(portal_username__iexact=username).first()
        if (
            client is None
            or not client.portal_enabled
            or client.status != Client.Status.ACTIVE
            or not client.check_portal_password(password)
        ):
            return error_response(
                correlation_id=correlation_id,
                code="invalid_credentials",
                message="Credenciais invalidas.",
                details={},
                http_status=status.HTTP_401_UNAUTHORIZED,
            )

        access_token = issue_client_portal_access_token(client)
        logger.info(
            "client_portal.login client_id=%s username=%s correlation_id=%s",
            client.pk,
            client.portal_username,
            correlation_id,
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "access_token": access_token,
                "token_type": "Bearer",
                "client": {
                    "id": str(client.pk),
                    "name": client.name,
                    "portal_username": client.portal_username,
                },
            },
        )


class ClientPortalMeView(APIView):
    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        return success_response(
            correlation_id=correlation_id,
            data={
                "client": {
                    "id": str(client.pk),
                    "name": client.name,
                    "portal_username": client.portal_username,
                },
            },
        )


class ClientPortalRequestListCreateView(APIView):
    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        qs = (
            ClientRequest.objects.filter(client=client)
            .select_related("converted_task")
            .prefetch_related("attachments")
            .order_by("-created_at")
        )
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        rows = list(qs[:200])
        return success_response(
            correlation_id=correlation_id,
            data={"requests": [portal_request_to_representation(row) for row in rows]},
            meta={"total": len(rows)},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        title = str(request.data.get("title") or "").strip()
        if not title:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe o titulo da demanda.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        uploads = _collect_upload_files(request)
        upload_error = _validate_uploads(uploads, correlation_id)
        if upload_error is not None:
            return upload_error

        with transaction.atomic():
            metadata: dict = {}
            if client.portal_default_project_id:
                metadata["portal_default_project_id"] = str(client.portal_default_project_id)
            if client.portal_default_board_id:
                metadata["portal_default_board_id"] = str(client.portal_default_board_id)

            item = ClientRequest.objects.create(
                client=client,
                client_name=client.name,
                contact_name=str(request.data.get("contact_name") or "").strip(),
                contact_email=str(request.data.get("contact_email") or "").strip(),
                contact_phone=str(request.data.get("contact_phone") or "").strip(),
                title=title,
                description=str(request.data.get("description") or "").strip(),
                metadata=metadata,
            )
            for upload in uploads:
                filename = str(getattr(upload, "name", "") or "arquivo")[:255]
                content_type = str(getattr(upload, "content_type", "") or "")
                if not content_type:
                    guessed, _ = mimetypes.guess_type(filename)
                    content_type = guessed or "application/octet-stream"
                kind = _guess_kind(content_type, filename)
                ct_base = content_type.split(";")[0].strip().lower()
                if kind == ClientRequestAttachment.Kind.AUDIO and (
                    ct_base.startswith("video/") or ct_base in {"application/octet-stream", ""}
                ):
                    if filename.lower().endswith(".ogg"):
                        content_type = "audio/ogg"
                    elif filename.lower().endswith((".m4a", ".mp4")):
                        content_type = "audio/mp4"
                    elif filename.lower().endswith((".mp3", ".mpeg")):
                        content_type = "audio/mpeg"
                    else:
                        content_type = "audio/webm"
                ClientRequestAttachment.objects.create(
                    client_request=item,
                    kind=kind,
                    filename=filename,
                    content_type=content_type[:100],
                    size_bytes=int(getattr(upload, "size", 0) or 0),
                    file=upload,
                )

        item = (
            ClientRequest.objects.select_related("converted_task")
            .prefetch_related("attachments")
            .get(pk=item.pk)
        )
        return success_response(
            correlation_id=correlation_id,
            data={"request": portal_request_to_representation(item)},
            http_status=status.HTTP_201_CREATED,
        )


class ClientPortalRequestDetailView(APIView):
    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]

    def get(self, request: Request, request_id: UUID):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        item = _get_client_request_or_404(client, request_id, correlation_id)
        if not isinstance(item, ClientRequest):
            return item
        return success_response(
            correlation_id=correlation_id,
            data={"request": portal_request_to_representation(item, include_feedback=True)},
        )


class ClientPortalRequestApproveView(APIView):
    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]

    def post(self, request: Request, request_id: UUID):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        item = _get_client_request_or_404(client, request_id, correlation_id)
        if not isinstance(item, ClientRequest):
            return item

        review_status = _effective_review_status(item)
        if review_status == "approved":
            return error_response(
                correlation_id=correlation_id,
                code="already_approved",
                message="Este pedido ja foi aprovado e nao pode ser alterado.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if review_status != "awaiting_client":
            return error_response(
                correlation_id=correlation_id,
                code="not_ready_for_review",
                message="So e possivel aprovar quando a demanda estiver concluida.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        item.client_review_status = "approved"
        item.client_revision_note = ""
        item.client_reviewed_at = timezone.now()
        item.save(update_fields=["client_review_status", "client_revision_note", "client_reviewed_at", "updated_at"])
        logger.info(
            "client_portal.approve request_id=%s client_id=%s correlation_id=%s",
            item.pk,
            client.pk,
            correlation_id,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"request": portal_request_to_representation(item, include_feedback=True)},
        )


class ClientPortalRequestRevisionView(APIView):
    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]

    def post(self, request: Request, request_id: UUID):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        item = _get_client_request_or_404(client, request_id, correlation_id)
        if not isinstance(item, ClientRequest):
            return item

        review_status = _effective_review_status(item)
        if review_status == "approved":
            return error_response(
                correlation_id=correlation_id,
                code="already_approved",
                message="Este pedido ja foi aprovado e nao pode ser alterado.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if review_status != "awaiting_client":
            return error_response(
                correlation_id=correlation_id,
                code="not_ready_for_review",
                message="So e possivel pedir revisao quando a demanda estiver concluida.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        note = str(request.data.get("note") or request.data.get("revision_note") or "").strip()
        if len(note) < 5:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Descreva o que ficou faltando ou errado (minimo 5 caracteres).",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        item.client_review_status = "revision_requested"
        item.client_revision_note = note[:4000]
        item.client_reviewed_at = timezone.now()
        item.save(update_fields=["client_review_status", "client_revision_note", "client_reviewed_at", "updated_at"])

        # Reabre a tarefa para a equipe se ainda estiver done
        task = item.converted_task
        if task is not None and str(task.status).lower() == "done":
            task.status = "in_progress"
            task.save(update_fields=["status", "updated_at"])

        logger.info(
            "client_portal.revision request_id=%s client_id=%s correlation_id=%s",
            item.pk,
            client.pk,
            correlation_id,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"request": portal_request_to_representation(item, include_feedback=True)},
        )


class ClientPortalAreaView(APIView):
    """GET /client-portal/area — workspace + projetos (somente leitura) do cliente vinculado."""

    authentication_classes = [ClientPortalJWTAuthentication]
    permission_classes = [IsClientPortal]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        client = _portal_client(request)
        workspace = (
            Workspace.objects.filter(client=client)
            .order_by("created_at")
            .first()
        )
        projects = (
            Project.objects.filter(client=client, archived_at__isnull=True)
            .select_related("portfolio__workspace")
            .order_by("name")
        )
        if workspace is None and projects.exists():
            first = projects.first()
            if first is not None:
                workspace = first.portfolio.workspace

        return success_response(
            correlation_id=correlation_id,
            data={
                "workspace": (
                    {
                        "id": str(workspace.pk),
                        "name": workspace.name,
                    }
                    if workspace is not None
                    else None
                ),
                "projects": [project_to_representation(p) for p in projects],
                "defaults": {
                    "project_id": (
                        str(client.portal_default_project_id) if client.portal_default_project_id else None
                    ),
                    "board_id": (
                        str(client.portal_default_board_id) if client.portal_default_board_id else None
                    ),
                },
            },
        )
