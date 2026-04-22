from __future__ import annotations

import logging
import math
from uuid import UUID

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.clients_serializers import ClientCreateSerializer
from blackbeans_api.api.clients_serializers import ClientUpdateSerializer
from blackbeans_api.api.clients_serializers import client_to_representation
from blackbeans_api.api.permissions import IsStaffOrSuperuser
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Workspace

logger = logging.getLogger(__name__)


def _actor_id(request: Request) -> str:
    return str(request.user.pk)


def _parse_positive_int(raw_value: str | None, default: int) -> int:
    if raw_value is None:
        return default
    parsed = int(raw_value)
    if parsed < 1:
        raise ValueError
    return parsed


class ClientsListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)

        status_filter = request.query_params.get("status")
        if status_filter and status_filter not in {
            Client.Status.ACTIVE,
            Client.Status.INACTIVE,
        }:
            return error_response(
                correlation_id=correlation_id,
                code="validation_error",
                message="Filtro de status invalido.",
                details={"status": ["Use active ou inactive."]},
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
                details={"pagination": ["page e page_size devem ser inteiros positivos."]},
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = min(page_size, 100)
        search = (request.query_params.get("search") or "").strip()

        queryset = Client.objects.all().order_by("name")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if search:
            queryset = queryset.filter(name__icontains=search)

        total = queryset.count()
        pages = max(1, math.ceil(total / page_size)) if total else 1
        start = (page - 1) * page_size
        end = start + page_size
        rows = queryset[start:end]

        return success_response(
            correlation_id=correlation_id,
            data={
                "clients": [client_to_representation(client) for client in rows],
            },
            meta={
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
                "status": status_filter or "",
                "search": search,
            },
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = ClientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        logger.info(
            "crm.client.created actor_id=%s correlation_id=%s client_id=%s",
            _actor_id(request),
            correlation_id,
            str(client.pk),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"client": client_to_representation(client)},
            http_status=status.HTTP_201_CREATED,
        )


class ClientDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def get(self, request: Request, client_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            client = Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="client_not_found",
                message="Cliente nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        workspaces_count = Workspace.objects.filter(client=client).count()
        portfolio_count = Portfolio.objects.filter(workspace__client=client).count()
        projects = Project.objects.filter(client=client)
        project_count = projects.count()
        completed_count = projects.filter(status=Project.Status.COMPLETED).count()
        at_risk_count = projects.filter(status=Project.Status.AT_RISK).count()

        return success_response(
            correlation_id=correlation_id,
            data={
                "client": client_to_representation(client),
                "stats": {
                    "workspaces_count": workspaces_count,
                    "portfolio_count": portfolio_count,
                    "project_count": project_count,
                    "completed_projects_count": completed_count,
                    "at_risk_projects_count": at_risk_count,
                },
            },
        )

    def patch(self, request: Request, client_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            client = Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="client_not_found",
                message="Cliente nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientUpdateSerializer(client, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        logger.info(
            "crm.client.updated actor_id=%s correlation_id=%s client_id=%s fields=%s",
            _actor_id(request),
            correlation_id,
            str(client.pk),
            sorted(serializer.validated_data.keys()),
        )
        return success_response(
            correlation_id=correlation_id,
            data={"client": client_to_representation(client)},
        )


class ClientStatusToggleView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]

    def post(self, request: Request, client_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            client = Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="client_not_found",
                message="Cliente nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )

        before_status = client.status
        client.status = (
            Client.Status.INACTIVE
            if client.status == Client.Status.ACTIVE
            else Client.Status.ACTIVE
        )
        client.save(update_fields=["status", "updated_at"])

        logger.info(
            "crm.client.status_toggled actor_id=%s correlation_id=%s client_id=%s before=%s after=%s",
            _actor_id(request),
            correlation_id,
            str(client.pk),
            before_status,
            client.status,
        )
        return success_response(
            correlation_id=correlation_id,
            data={
                "client_id": str(client.pk),
                "status": client.status,
            },
        )
