from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.users_serializers import AdminUserCreateSerializer
from blackbeans_api.api.users_serializers import AdminUserUpdateSerializer
from blackbeans_api.api.users_serializers import CollaboratorLinkCreateSerializer
from blackbeans_api.api.users_serializers import user_to_representation
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.users.models import UserCollaboratorLink

User = get_user_model()

logger = logging.getLogger(__name__)


def _actor_id(request: Request) -> str:
    return str(request.user.pk)


class AdminUserListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = serializer.save()
        except IntegrityError:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Nao foi possivel criar usuario (conflito de dados).",
                details={},
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        logger.info(
            "iam.user.created actor_id=%s correlation_id=%s target_user_id=%s",
            _actor_id(request),
            correlation_id,
            user.pk,
        )
        return success_response(
            correlation_id=correlation_id,
            data={"user": user_to_representation(user)},
            http_status=status.HTTP_201_CREATED,
        )


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def patch(self, request: Request, user_id: int):
        correlation_id = get_correlation_id(request)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="user_not_found",
                message="Usuario nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AdminUserUpdateSerializer(
            data=request.data,
            partial=True,
            instance=user,
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(user, serializer.validated_data)
        vd = serializer.validated_data

        if vd.get("is_active") is False:
            logger.warning(
                "iam.user.deactivated actor_id=%s correlation_id=%s target_user_id=%s",
                _actor_id(request),
                correlation_id,
                user.pk,
            )
        logger.info(
            "iam.user.updated actor_id=%s correlation_id=%s target_user_id=%s fields=%s",
            _actor_id(request),
            correlation_id,
            user.pk,
            sorted(vd.keys()),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"user": user_to_representation(user)},
        )


class AdminUserCollaboratorLinkView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, user_id: int):
        correlation_id = get_correlation_id(request)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="user_not_found",
                message="Usuario nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        ser = CollaboratorLinkCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        collaborator = ser.validated_data["collaborator"]

        if UserCollaboratorLink.objects.filter(user=user, is_active=True).exists():
            return error_response(
                correlation_id=correlation_id,
                code="link_conflict",
                message="Usuario ja possui vinculo ativo com colaborador.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if UserCollaboratorLink.objects.filter(
            collaborator=collaborator,
            is_active=True,
        ).exists():
            return error_response(
                correlation_id=correlation_id,
                code="link_conflict",
                message="Colaborador ja vinculado a outro usuario ativo.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        try:
            with transaction.atomic():
                link = UserCollaboratorLink.objects.create(
                    user=user,
                    collaborator=collaborator,
                    is_active=True,
                )
        except IntegrityError:
            return error_response(
                correlation_id=correlation_id,
                code="link_conflict",
                message="Conflito ao criar vinculo.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        logger.info(
            "iam.collaborator.linked actor_id=%s correlation_id=%s user_id=%s collaborator_id=%s",
            _actor_id(request),
            correlation_id,
            user.pk,
            str(collaborator.pk),
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "user_id": user.pk,
                "collaborator_id": str(collaborator.pk),
                "is_active": link.is_active,
                "link_id": link.pk,
            },
            http_status=status.HTTP_201_CREATED,
        )


class AdminUserCollaboratorLinkDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def delete(self, request: Request, user_id: int, collaborator_id):
        correlation_id = get_correlation_id(request)
        link = (
            UserCollaboratorLink.objects.filter(
                user_id=user_id,
                collaborator_id=collaborator_id,
            )
            .order_by("-pk")
            .first()
        )
        if link is None:
            return error_response(
                correlation_id=correlation_id,
                code="link_not_found",
                message="Vinculo nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        if link.is_active:
            link.is_active = False
            link.save(update_fields=["is_active", "updated_at"])
            logger.info(
                "iam.collaborator.unlinked actor_id=%s correlation_id=%s user_id=%s collaborator_id=%s",
                _actor_id(request),
                correlation_id,
                user_id,
                str(collaborator_id),
            )

        return success_response(
            correlation_id=correlation_id,
            data={
                "user_id": user_id,
                "collaborator_id": str(collaborator_id),
                "is_active": False,
            },
        )
