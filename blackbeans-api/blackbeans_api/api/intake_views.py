from __future__ import annotations

import logging
from datetime import date
from datetime import datetime
from datetime import time
from uuid import UUID

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.serializers import ValidationError as SerializerValidationError
from rest_framework.views import APIView

from blackbeans_api.api.operations_serializers import task_to_representation
from blackbeans_api.api.operations_serializers import validate_active_task_status
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.clients.models import Client
from blackbeans_api.governance.board_status import catalog_key_for_bucket
from blackbeans_api.governance.board_status import find_or_create_status_group
from blackbeans_api.governance.board_status import status_bucket
from blackbeans_api.governance.board_status import sync_task_board_by_pull_status
from blackbeans_api.governance.board_status import sync_task_group_by_status
from blackbeans_api.governance.intake_service import ALLOWED_INTAKE_EXTENSIONS
from blackbeans_api.governance.intake_service import extract_text_from_bytes
from blackbeans_api.governance.intake_service import match_assignee
from blackbeans_api.governance.intake_service import match_client
from blackbeans_api.governance.intake_service import suggest_tasks_from_ata
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskIntakeBatch
from blackbeans_api.governance.models import TaskIntakeDraft

logger = logging.getLogger(__name__)

MAX_ATA_BYTES = 15 * 1024 * 1024


def _iso(value) -> str | None:
    if not value:
        return None
    return value.isoformat().replace("+00:00", "Z")


def draft_to_representation(draft: TaskIntakeDraft) -> dict:
    assignee = draft.suggested_assignee
    client = draft.suggested_client
    project = draft.target_project
    return {
        "id": str(draft.pk),
        "batch_id": str(draft.batch_id),
        "title": draft.title,
        "description": draft.description,
        "assignee_hint": draft.assignee_hint,
        "suggested_assignee_id": assignee.pk if assignee else None,
        "suggested_assignee_name": (
            (assignee.name or assignee.username or assignee.email) if assignee else ""
        ),
        "suggested_client_id": str(client.pk) if client else None,
        "suggested_client_label": client.name if client else "",
        "target_project_id": str(project.pk) if project else None,
        "target_project_label": project.name if project else "",
        "task_status": (draft.task_status or Task.Status.TODO).strip() or Task.Status.TODO,
        "priority": (draft.priority or Task.Priority.MEDIUM).strip() or Task.Priority.MEDIUM,
        "due_date": draft.due_date.isoformat() if draft.due_date else None,
        "status": draft.status,
        "converted_task_id": str(draft.converted_task_id) if draft.converted_task_id else None,
        "position": draft.position,
        "created_at": _iso(draft.created_at),
        "updated_at": _iso(draft.updated_at),
    }


def batch_to_representation(batch: TaskIntakeBatch, *, include_drafts: bool = True) -> dict:
    client = batch.suggested_client
    payload = {
        "id": str(batch.pk),
        "filename": batch.filename,
        "status": batch.status,
        "suggested_client_name": batch.suggested_client_name,
        "suggested_client_id": str(client.pk) if client else None,
        "suggested_client_label": client.name if client else "",
        "converted_project_id": str(batch.converted_project_id) if batch.converted_project_id else None,
        "created_at": _iso(batch.created_at),
        "updated_at": _iso(batch.updated_at),
        "drafts_count": batch.drafts.count() if not include_drafts else None,
    }
    if include_drafts:
        payload["drafts"] = [draft_to_representation(item) for item in batch.drafts.all()]
        payload["drafts_count"] = len(payload["drafts"])
    return payload


def _intake_batch_qs():
    return TaskIntakeBatch.objects.select_related("suggested_client", "converted_project").prefetch_related(
        "drafts__suggested_assignee",
        "drafts__suggested_client",
        "drafts__target_project",
    )


def _load_client(value) -> Client | None:
    if value in ("", None):
        return None
    try:
        return Client.objects.filter(pk=value).first()
    except (ValueError, TypeError, ValidationError):
        return None


def _load_project(value) -> Project | None:
    if value in ("", None):
        return None
    try:
        return Project.objects.filter(pk=value).first()
    except (ValueError, TypeError, ValidationError):
        return None


def _parse_due_date(value) -> date | None:
    if value in ("", None):
        return None
    parsed = parse_date(str(value).strip()[:10])
    if parsed is None:
        raise ValueError("invalid_due_date")
    return parsed


def _due_datetime(due: date | None) -> datetime | None:
    if due is None:
        return None
    dt = datetime.combine(due, time(12, 0, 0))
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _resolve_task_status(value: str | None) -> str:
    raw = (value or "").strip() or Task.Status.TODO
    try:
        return validate_active_task_status(raw)
    except SerializerValidationError:
        return catalog_key_for_bucket("backlog") or Task.Status.TODO


def _resolve_priority(value: str | None) -> str:
    raw = (value or "").strip().lower() or Task.Priority.MEDIUM
    allowed = {choice.value for choice in Task.Priority}
    if raw in allowed:
        return raw
    return Task.Priority.MEDIUM


def _board_group_for_status(project: Project, status_key: str):
    board = project.boards.order_by("created_at").first()
    if board is None:
        board = Board.objects.create(project=project, name="Board")
    group = find_or_create_status_group(board, status_bucket(status_key))
    return board, group


class TaskIntakeListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        rows = list(
            TaskIntakeBatch.objects.select_related("suggested_client", "converted_project")
            .prefetch_related("drafts__suggested_assignee", "drafts__suggested_client", "drafts__target_project")
            .all()[:200]
        )
        return success_response(
            correlation_id=correlation_id,
            data={"batches": [batch_to_representation(row, include_drafts=True) for row in rows]},
            meta={"total": len(rows)},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        uploaded = request.FILES.get("file") or request.FILES.get("ata")
        if uploaded is None:
            return error_response(
                correlation_id=correlation_id,
                code="file_required",
                message="Anexe a ata (pdf, docx, txt ou md).",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        filename = str(getattr(uploaded, "name", "") or "ata.txt")
        filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
        ext = ""
        if "." in filename:
            ext = "." + filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_INTAKE_EXTENSIONS:
            return error_response(
                correlation_id=correlation_id,
                code="unsupported_type",
                message="Formato nao suportado. Use pdf, docx, txt ou md.",
                details={"filename": filename},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        size_bytes = int(getattr(uploaded, "size", 0) or 0)
        if size_bytes <= 0 or size_bytes > MAX_ATA_BYTES:
            return error_response(
                correlation_id=correlation_id,
                code="file_too_large",
                message="Arquivo vazio ou acima de 15MB.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            payload = uploaded.read()
            text = extract_text_from_bytes(filename, payload).strip()
        except Exception:  # noqa: BLE001
            logger.exception("intake.extract_failed filename=%s", filename)
            return error_response(
                correlation_id=correlation_id,
                code="extract_failed",
                message="Falha ao ler a ata. Tente PDF com texto selecionavel, Word (.docx) ou .txt.",
                details={"filename": filename},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        if not text:
            pdf_hint = (
                " Este PDF parece ser imagem/escaneado ou protegido."
                if ext == ".pdf"
                else ""
            )
            return error_response(
                correlation_id=correlation_id,
                code="empty_ata",
                message=(
                    "Nao foi possivel extrair texto da ata."
                    + pdf_hint
                    + " Use PDF com texto selecionavel, .docx ou .txt."
                ),
                details={"filename": filename},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            suggestion = suggest_tasks_from_ata(filename=filename, text=text)
        except Exception:  # noqa: BLE001
            logger.exception("intake.suggest_failed filename=%s", filename)
            return error_response(
                correlation_id=correlation_id,
                code="suggest_failed",
                message="A ata foi lida, mas falhou a geracao dos rascunhos. Tente novamente.",
                details={"filename": filename},
                http_status=status.HTTP_502_BAD_GATEWAY,
            )
        client = match_client(suggestion.get("client_name"))
        try:
            with transaction.atomic():
                batch = TaskIntakeBatch.objects.create(
                    created_by=request.user if request.user.is_authenticated else None,
                    filename=filename,
                    ata_file=ContentFile(payload, name=filename),
                    extracted_text=text[:80_000],
                    suggested_client_name=str(suggestion.get("client_name") or "")[:255],
                    suggested_client=client,
                    status=TaskIntakeBatch.Status.PENDING_REVIEW,
                )
                for index, item in enumerate(suggestion.get("tasks") or []):
                    hint = str(item.get("assignee_hint") or "")
                    draft_client = match_client(item.get("client_name")) if item.get("client_name") else None
                    TaskIntakeDraft.objects.create(
                        batch=batch,
                        title=str(item.get("title") or "Tarefa")[:255],
                        description=str(item.get("description") or ""),
                        assignee_hint=hint[:255],
                        suggested_assignee=match_assignee(hint),
                        suggested_client=draft_client,
                        status=TaskIntakeDraft.Status.PENDING,
                        position=index,
                    )
        except Exception:  # noqa: BLE001
            logger.exception("intake.save_failed filename=%s", filename)
            return error_response(
                correlation_id=correlation_id,
                code="save_failed",
                message="A ata foi lida, mas falhou ao gravar os rascunhos. Tente novamente.",
                details={"filename": filename},
                http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        batch = _intake_batch_qs().get(pk=batch.pk)
        return success_response(
            correlation_id=correlation_id,
            data={"batch": batch_to_representation(batch)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskIntakeDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, batch_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            batch = (
                TaskIntakeBatch.objects.select_related("suggested_client", "converted_project")
                .prefetch_related(
                    "drafts__suggested_assignee",
                    "drafts__suggested_client",
                    "drafts__target_project",
                )
                .get(pk=batch_id)
            )
        except TaskIntakeBatch.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Lote nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(
            correlation_id=correlation_id,
            data={"batch": batch_to_representation(batch)},
        )

    def delete(self, request: Request, batch_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            batch = TaskIntakeBatch.objects.get(pk=batch_id)
        except TaskIntakeBatch.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Ata nao encontrada.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        ata_file = batch.ata_file
        batch.delete()
        if ata_file:
            try:
                ata_file.delete(save=False)
            except Exception:  # noqa: BLE001
                logger.warning("intake.ata_file_delete_failed batch_id=%s", batch_id, exc_info=True)
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class TaskIntakeDraftDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def patch(self, request: Request, batch_id: UUID, draft_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            draft = TaskIntakeDraft.objects.select_related(
                "batch",
                "suggested_assignee",
                "suggested_client",
                "target_project",
            ).get(
                pk=draft_id,
                batch_id=batch_id,
            )
        except TaskIntakeDraft.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Rascunho nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if draft.status == TaskIntakeDraft.Status.CONVERTED or draft.batch.status == TaskIntakeBatch.Status.CONVERTED:
            return error_response(
                correlation_id=correlation_id,
                code="already_converted",
                message="Rascunho ja convertido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        title = request.data.get("title")
        description = request.data.get("description")
        assignee_hint = request.data.get("assignee_hint")
        assignee_id = request.data.get("suggested_assignee_id")
        draft_status = request.data.get("status")
        fields: list[str] = []
        if title is not None:
            draft.title = str(title).strip()[:255] or draft.title
            fields.append("title")
        if description is not None:
            draft.description = str(description)
            fields.append("description")
        if assignee_hint is not None:
            draft.assignee_hint = str(assignee_hint)[:255]
            fields.append("assignee_hint")
        if assignee_id is not None:
            if assignee_id in ("", None):
                draft.suggested_assignee = None
            else:
                try:
                    user_id = int(assignee_id)
                except (TypeError, ValueError):
                    return error_response(
                        correlation_id=correlation_id,
                        code="validation_error",
                        message="Responsavel invalido.",
                        details={},
                        http_status=status.HTTP_400_BAD_REQUEST,
                    )
                from django.contrib.auth import get_user_model

                User = get_user_model()
                user = User.objects.filter(pk=user_id, is_active=True).first()
                if user is None:
                    return error_response(
                        correlation_id=correlation_id,
                        code="not_found",
                        message="Usuario nao encontrado.",
                        details={},
                        http_status=status.HTTP_404_NOT_FOUND,
                    )
                draft.suggested_assignee = user
            fields.append("suggested_assignee")
        if "suggested_client_id" in request.data:
            raw_client = request.data.get("suggested_client_id")
            if raw_client in ("", None):
                draft.suggested_client = None
            else:
                client = _load_client(raw_client)
                if client is None:
                    return error_response(
                        correlation_id=correlation_id,
                        code="not_found",
                        message="Cliente nao encontrado.",
                        details={},
                        http_status=status.HTTP_404_NOT_FOUND,
                    )
                draft.suggested_client = client
            fields.append("suggested_client")
        if "target_project_id" in request.data:
            raw_project = request.data.get("target_project_id")
            if raw_project in ("", None):
                draft.target_project = None
            else:
                project = _load_project(raw_project)
                if project is None:
                    return error_response(
                        correlation_id=correlation_id,
                        code="not_found",
                        message="Projeto nao encontrado.",
                        details={},
                        http_status=status.HTTP_404_NOT_FOUND,
                    )
                draft.target_project = project
            fields.append("target_project")
        if "task_status" in request.data:
            raw_status = str(request.data.get("task_status") or "").strip()
            if not raw_status:
                draft.task_status = Task.Status.TODO
            else:
                try:
                    draft.task_status = validate_active_task_status(raw_status)
                except SerializerValidationError:
                    return error_response(
                        correlation_id=correlation_id,
                        code="validation_error",
                        message="Status da tarefa invalido.",
                        details={},
                        http_status=status.HTTP_400_BAD_REQUEST,
                    )
            fields.append("task_status")
        if "priority" in request.data:
            raw_priority = str(request.data.get("priority") or "").strip().lower()
            if not raw_priority:
                draft.priority = Task.Priority.MEDIUM
            elif raw_priority not in {choice.value for choice in Task.Priority}:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Prioridade invalida.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                draft.priority = raw_priority
            fields.append("priority")
        if "due_date" in request.data:
            try:
                draft.due_date = _parse_due_date(request.data.get("due_date"))
            except ValueError:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Data invalida.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            fields.append("due_date")
        if draft_status is not None:
            allowed = {choice.value for choice in TaskIntakeDraft.Status}
            if str(draft_status) not in allowed:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Status de rascunho invalido.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            draft.status = str(draft_status)
            fields.append("status")
        if fields:
            fields.append("updated_at")
            draft.save(update_fields=fields)
        return success_response(
            correlation_id=correlation_id,
            data={"draft": draft_to_representation(draft)},
        )

    def delete(self, request: Request, batch_id: UUID, draft_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            draft = TaskIntakeDraft.objects.select_related("batch").get(pk=draft_id, batch_id=batch_id)
        except TaskIntakeDraft.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Rascunho nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if draft.batch.status == TaskIntakeBatch.Status.CONVERTED:
            return error_response(
                correlation_id=correlation_id,
                code="already_converted",
                message="Lote ja convertido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        draft.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class TaskIntakeDraftCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, batch_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            batch = TaskIntakeBatch.objects.get(pk=batch_id)
        except TaskIntakeBatch.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Lote nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if batch.status == TaskIntakeBatch.Status.CONVERTED:
            return error_response(
                correlation_id=correlation_id,
                code="already_converted",
                message="Lote ja convertido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        title = str(request.data.get("title") or "").strip()[:255]
        if not title:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe o titulo do rascunho.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        next_position = (batch.drafts.order_by("-position").values_list("position", flat=True).first() or 0) + 1
        draft = TaskIntakeDraft.objects.create(
            batch=batch,
            title=title,
            description=str(request.data.get("description") or ""),
            assignee_hint=str(request.data.get("assignee_hint") or "")[:255],
            status=TaskIntakeDraft.Status.PENDING,
            position=next_position,
        )
        draft = TaskIntakeDraft.objects.select_related(
            "suggested_assignee",
            "suggested_client",
            "target_project",
        ).get(pk=draft.pk)
        return success_response(
            correlation_id=correlation_id,
            data={"draft": draft_to_representation(draft)},
            http_status=status.HTTP_201_CREATED,
        )


class TaskIntakeConvertView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, batch_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            batch = (
                TaskIntakeBatch.objects.prefetch_related(
                    "drafts__suggested_assignee",
                    "drafts__suggested_client",
                    "drafts__target_project",
                ).get(pk=batch_id)
            )
        except TaskIntakeBatch.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="not_found",
                message="Lote nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if batch.status == TaskIntakeBatch.Status.CONVERTED:
            return error_response(
                correlation_id=correlation_id,
                code="already_converted",
                message="Lote ja convertido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        default_project = _load_project(
            request.data.get("default_project_id") or request.data.get("project_id")
        )
        default_client = _load_client(request.data.get("default_client_id"))
        selected_ids: set[str] | None = None
        raw_ids = request.data.get("draft_ids")
        if raw_ids not in (None, ""):
            if not isinstance(raw_ids, (list, tuple)):
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="draft_ids deve ser uma lista.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            selected_ids = {str(item) for item in raw_ids if str(item).strip()}
            if not selected_ids:
                return error_response(
                    correlation_id=correlation_id,
                    code="validation_error",
                    message="Nenhum rascunho selecionado.",
                    details={},
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
        drafts = [
            item
            for item in batch.drafts.all()
            if item.status not in {TaskIntakeDraft.Status.DISCARDED, TaskIntakeDraft.Status.CONVERTED}
            and (selected_ids is None or str(item.pk) in selected_ids)
        ]
        if not drafts:
            return error_response(
                correlation_id=correlation_id,
                code="no_drafts",
                message="Nenhum rascunho para converter.",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        missing_project = [
            {"id": str(item.pk), "title": item.title}
            for item in drafts
            if not (item.target_project_id or (default_project.pk if default_project else None))
        ]
        if missing_project:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe o projeto padrao ou o projeto de cada rascunho.",
                details={"missing_project": missing_project},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        missing_client = [
            {"id": str(item.pk), "title": item.title}
            for item in drafts
            if not (item.suggested_client_id or (default_client.pk if default_client else None))
        ]
        if missing_client:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Informe o cliente padrao ou o cliente de cada rascunho.",
                details={"missing_client": missing_client},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        created_tasks = []
        used_projects: list[Project] = []
        with transaction.atomic():
            for draft in drafts:
                project = draft.target_project or default_project
                if project is None:
                    continue
                client = draft.suggested_client or default_client
                if client is not None and project.client_id is None:
                    project.client_id = client.pk
                    project.save(update_fields=["client_id", "updated_at"])
                task_status = _resolve_task_status(draft.task_status)
                priority = _resolve_priority(draft.priority)
                _board, group = _board_group_for_status(project, task_status)
                task = Task.objects.create(
                    board=group.board,
                    group=group,
                    title=draft.title,
                    description=draft.description,
                    status=task_status,
                    priority=priority,
                    assignee=draft.suggested_assignee,
                    end_date=_due_datetime(draft.due_date),
                    effort_points=1,
                )
                sync_task_board_by_pull_status(task)
                task.refresh_from_db()
                sync_task_group_by_status(task)
                if client is not None and not draft.suggested_client_id:
                    draft.suggested_client = client
                if not draft.target_project_id:
                    draft.target_project = project
                draft.status = TaskIntakeDraft.Status.CONVERTED
                draft.converted_task = task
                draft.save(
                    update_fields=[
                        "status",
                        "converted_task",
                        "suggested_client",
                        "target_project",
                        "updated_at",
                    ]
                )
                created_tasks.append(task)
                used_projects.append(project)
            remaining = batch.drafts.exclude(
                status__in=[TaskIntakeDraft.Status.DISCARDED, TaskIntakeDraft.Status.CONVERTED]
            ).exists()
            if not remaining:
                batch.status = TaskIntakeBatch.Status.CONVERTED
            unique_ids = {str(row.pk) for row in used_projects}
            if len(unique_ids) == 1:
                batch.converted_project = used_projects[0]
            batch.save(update_fields=["status", "converted_project", "updated_at"])
        return success_response(
            correlation_id=correlation_id,
            data={
                "batch": batch_to_representation(_intake_batch_qs().get(pk=batch.pk)),
                "tasks": [task_to_representation(task) for task in created_tasks],
            },
        )
