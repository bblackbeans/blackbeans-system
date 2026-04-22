from __future__ import annotations

import logging

from django.db import IntegrityError
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.collaborators_serializers import CollaboratorCreateSerializer
from blackbeans_api.api.collaborators_serializers import CollaboratorDepartmentLinkCreateSerializer
from blackbeans_api.api.collaborators_serializers import CollaboratorUpdateSerializer
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.users.models import Collaborator
from blackbeans_api.users.models import CollaboratorDepartmentLink
from blackbeans_api.users.models import Department
from blackbeans_api.users.models import UserCollaboratorLink

logger = logging.getLogger(__name__)


def _actor_id(request: Request) -> str:
    return str(request.user.pk)


def _department_summary(department: Department | None) -> dict | None:
    if department is None:
        return None
    return {
        "id": str(department.pk),
        "name": department.name,
        "code": department.code or "",
    }


def collaborator_to_representation(
    collaborator: Collaborator,
    *,
    active_department: Department | None = None,
) -> dict:
    return {
        "id": str(collaborator.pk),
        "display_name": collaborator.display_name,
        "job_title": collaborator.job_title or "",
        "professional_email": collaborator.professional_email or "",
        "phone": collaborator.phone or "",
        "created_at": collaborator.created_at.isoformat(),
        "updated_at": collaborator.updated_at.isoformat(),
        "department": _department_summary(active_department),
    }


def _active_department_for(collaborator: Collaborator) -> Department | None:
    link = (
        CollaboratorDepartmentLink.objects.filter(
            collaborator=collaborator,
            is_active=True,
        )
        .select_related("department")
        .first()
    )
    return link.department if link else None


class AdminCollaboratorListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = CollaboratorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        collaborator = serializer.save()
        logger.info(
            "iam.collaborator.created actor_id=%s correlation_id=%s collaborator_id=%s",
            _actor_id(request),
            correlation_id,
            str(collaborator.pk),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"collaborator": collaborator_to_representation(collaborator)},
            http_status=status.HTTP_201_CREATED,
        )


class AdminCollaboratorDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def patch(self, request: Request, collaborator_id):
        correlation_id = get_correlation_id(request)
        try:
            collaborator = Collaborator.objects.get(pk=collaborator_id)
        except Collaborator.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="collaborator_not_found",
                message="Colaborador nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CollaboratorUpdateSerializer(
            instance=collaborator,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data
        if vd:
            serializer.save()
            collaborator.refresh_from_db()
            logger.info(
                "iam.collaborator.updated actor_id=%s correlation_id=%s collaborator_id=%s fields=%s",
                _actor_id(request),
                correlation_id,
                str(collaborator.pk),
                sorted(vd.keys()),
            )
        return success_response(
            correlation_id=correlation_id,
            data={
                "collaborator": collaborator_to_representation(
                    collaborator,
                    active_department=_active_department_for(collaborator),
                ),
            },
        )


class AdminCollaboratorDepartmentLinkView(APIView):
    """Substitui vinculo ativo anterior em transacao; idempotente se mesmo departamento ja ativo."""

    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, collaborator_id):
        correlation_id = get_correlation_id(request)
        try:
            collaborator = Collaborator.objects.get(pk=collaborator_id)
        except Collaborator.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="collaborator_not_found",
                message="Colaborador nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        ser = CollaboratorDepartmentLinkCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        department_id = ser.validated_data["department_id"]
        try:
            department = Department.objects.get(pk=department_id)
        except Department.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="department_not_found",
                message="Departamento nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        try:
            with transaction.atomic():
                locked = list(
                    CollaboratorDepartmentLink.objects.select_for_update().filter(
                        collaborator=collaborator,
                        is_active=True,
                    ),
                )
                if (
                    len(locked) == 1
                    and locked[0].department_id == department.pk
                ):
                    link = locked[0]
                    http_status = status.HTTP_200_OK
                else:
                    CollaboratorDepartmentLink.objects.filter(
                        collaborator=collaborator,
                        is_active=True,
                    ).update(is_active=False)
                    link = CollaboratorDepartmentLink.objects.create(
                        collaborator=collaborator,
                        department=department,
                        is_active=True,
                    )
                    http_status = status.HTTP_201_CREATED
                    logger.info(
                        "iam.collaborator.department_linked actor_id=%s correlation_id=%s "
                        "collaborator_id=%s department_id=%s link_id=%s",
                        _actor_id(request),
                        correlation_id,
                        str(collaborator.pk),
                        str(department.pk),
                        link.pk,
                    )
        except IntegrityError:
            return error_response(
                correlation_id=correlation_id,
                code="link_conflict",
                message="Conflito ao vincular departamento.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        return success_response(
            correlation_id=correlation_id,
            data={
                "collaborator_id": str(collaborator.pk),
                "department_id": str(department.pk),
                "link_id": link.pk,
                "is_active": link.is_active,
            },
            http_status=http_status,
        )


class MeCollaboratorProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        ulink = (
            UserCollaboratorLink.objects.filter(
                user=request.user,
                is_active=True,
            )
            .select_related("collaborator")
            .first()
        )
        if ulink is None:
            return error_response(
                correlation_id=correlation_id,
                code="collaborator_profile_not_found",
                message="Nenhum perfil de colaborador vinculado a este usuario.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        collaborator = ulink.collaborator
        dept = _active_department_for(collaborator)
        return success_response(
            correlation_id=correlation_id,
            data={
                "profile": collaborator_to_representation(
                    collaborator,
                    active_department=dept,
                ),
            },
        )
