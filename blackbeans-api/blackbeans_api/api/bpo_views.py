from __future__ import annotations

from datetime import datetime
from datetime import time
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from blackbeans_api.api.bpo_serializers import ClientContractSerializer
from blackbeans_api.api.bpo_serializers import ServiceCatalogSerializer
from blackbeans_api.api.permissions import IsAuthenticatedReadElseStaff
from blackbeans_api.api.responses import error_response
from blackbeans_api.api.responses import success_response
from blackbeans_api.api.utils import get_correlation_id
from blackbeans_api.governance.models import ClientContract
from blackbeans_api.governance.models import ContractServiceLine
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import ServiceCatalog
from blackbeans_api.governance.models import Workspace

DEFAULT_PORTFOLIO_NAME = "Default"


def _line_to_representation(line: ContractServiceLine) -> dict:
    return {
        "id": str(line.pk),
        "service_id": str(line.service_id),
        "service_name": line.service.name,
        "service_type": line.service_type,
        "recurrence": line.recurrence,
        "recurrence_other": line.recurrence_other,
        "amount": str(line.amount),
        "starts_on": line.starts_on.isoformat() if line.starts_on else None,
        "ends_on": line.ends_on.isoformat() if line.ends_on else None,
        "notes": line.notes,
    }


def _contract_to_representation(contract: ClientContract) -> dict:
    return {
        "id": str(contract.pk),
        "client_id": str(contract.client_id),
        "client_name": contract.client.name,
        "emits_invoice": contract.emits_invoice,
        "has_iss_retention": contract.has_iss_retention,
        "has_inss_retention": contract.has_inss_retention,
        "payment_method": contract.payment_method,
        "payment_other": contract.payment_other,
        "status": contract.status,
        "notes": contract.notes,
        "created_by": contract.created_by_id,
        "created_at": contract.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": contract.updated_at.isoformat().replace("+00:00", "Z"),
        "service_lines": [_line_to_representation(line) for line in contract.service_lines.select_related("service").all()],
    }


def _date_to_datetime(value):
    if value is None:
        return None
    return timezone.make_aware(datetime.combine(value, time(hour=9)))


class ServiceCatalogListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = ServiceCatalog.objects.order_by("display_order", "name")
        is_active = request.query_params.get("is_active")
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=is_active == "true")
        data = ServiceCatalogSerializer(queryset, many=True).data
        return success_response(correlation_id=correlation_id, data={"services": data})

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = ServiceCatalogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.save()
        return success_response(
            correlation_id=correlation_id,
            data={"service": ServiceCatalogSerializer(service).data},
            http_status=status.HTTP_201_CREATED,
        )


class ServiceCatalogDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def patch(self, request: Request, service_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            service = ServiceCatalog.objects.get(pk=service_id)
        except ServiceCatalog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="service_not_found",
                message="Servico nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ServiceCatalogSerializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(correlation_id=correlation_id, data={"service": serializer.data})

    def delete(self, request: Request, service_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            service = ServiceCatalog.objects.get(pk=service_id)
        except ServiceCatalog.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="service_not_found",
                message="Servico nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if ContractServiceLine.objects.filter(service=service).exists():
            return error_response(
                correlation_id=correlation_id,
                code="service_in_use",
                message="Servico vinculado a contratos e nao pode ser excluido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        service.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class ContractListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request):
        correlation_id = get_correlation_id(request)
        queryset = ClientContract.objects.select_related("client").order_by("-created_at")
        client_id = request.query_params.get("client_id")
        status_filter = request.query_params.get("status")
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return success_response(
            correlation_id=correlation_id,
            data={"contracts": [_contract_to_representation(contract) for contract in queryset[:100]]},
        )

    def post(self, request: Request):
        correlation_id = get_correlation_id(request)
        serializer = ClientContractSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contract = serializer.save(created_by=request.user)
        return success_response(
            correlation_id=correlation_id,
            data={"contract": _contract_to_representation(contract)},
            http_status=status.HTTP_201_CREATED,
        )


class ContractDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def get(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.select_related("client").get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return success_response(correlation_id=correlation_id, data={"contract": _contract_to_representation(contract)})

    def patch(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ClientContractSerializer(contract, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        contract = serializer.save()
        return success_response(correlation_id=correlation_id, data={"contract": _contract_to_representation(contract)})

    def delete(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if contract.status == ClientContract.Status.ACTIVE:
            return error_response(
                correlation_id=correlation_id,
                code="contract_active",
                message="Contrato ativo nao pode ser excluido. Cancele antes.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        if Project.objects.filter(contract_line__contract=contract).exists():
            return error_response(
                correlation_id=correlation_id,
                code="contract_has_projects",
                message="Contrato possui projetos vinculados e nao pode ser excluido.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        contract.delete()
        return success_response(correlation_id=correlation_id, data={"deleted": True})


class ContractConfirmView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def post(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.select_related("client").get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if contract.status in {ClientContract.Status.CANCELLED, ClientContract.Status.CLOSED}:
            return error_response(
                correlation_id=correlation_id,
                code="contract_invalid_status",
                message="Contrato nao pode ser confirmado no status atual.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            workspace, _ = Workspace.objects.get_or_create(
                client=contract.client,
                defaults={"name": contract.client.name},
            )
            portfolio, _ = Portfolio.objects.get_or_create(
                workspace=workspace,
                name=DEFAULT_PORTFOLIO_NAME,
                defaults={"description": "Criado automaticamente pela confirmacao do contrato."},
            )

            created_projects: list[Project] = []
            lines = contract.service_lines.select_related("service").all()
            for line in lines:
                project = Project.objects.filter(contract_line=line).first()
                if project:
                    continue
                project = Project.objects.create(
                    portfolio=portfolio,
                    client=contract.client,
                    contract_line=line,
                    name=f"{line.service.name} - {contract.client.name}",
                    description=f"Criado automaticamente pelo contrato {contract.pk}.",
                    status=Project.Status.PLANNED,
                    start_date=_date_to_datetime(line.starts_on),
                    end_date=_date_to_datetime(line.ends_on),
                )
                created_projects.append(project)

            contract.status = ClientContract.Status.ACTIVE
            contract.save(update_fields=["status", "updated_at"])

        return success_response(
            correlation_id=correlation_id,
            data={
                "contract": _contract_to_representation(contract),
                "workspace_id": str(workspace.pk),
                "portfolio_id": str(portfolio.pk),
                "projects_created": [
                    {"id": str(project.pk), "name": project.name, "contract_line_id": str(project.contract_line_id)}
                    for project in created_projects
                ],
            },
        )


class ContractCancelView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def post(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        contract.status = ClientContract.Status.CANCELLED
        contract.save(update_fields=["status", "updated_at"])
        return success_response(correlation_id=correlation_id, data={"contract": _contract_to_representation(contract)})


class ContractReactivateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedReadElseStaff]

    def post(self, request: Request, contract_id: UUID):
        correlation_id = get_correlation_id(request)
        try:
            contract = ClientContract.objects.get(pk=contract_id)
        except ClientContract.DoesNotExist:
            return error_response(
                correlation_id=correlation_id,
                code="contract_not_found",
                message="Contrato nao encontrado.",
                details={},
                http_status=status.HTTP_404_NOT_FOUND,
            )
        if contract.status != ClientContract.Status.CANCELLED:
            return error_response(
                correlation_id=correlation_id,
                code="contract_invalid_status",
                message="Somente contratos cancelados podem ser reativados.",
                details={},
                http_status=status.HTTP_409_CONFLICT,
            )
        has_projects = Project.objects.filter(contract_line__contract=contract).exists()
        contract.status = ClientContract.Status.ACTIVE if has_projects else ClientContract.Status.SUBMITTED
        contract.save(update_fields=["status", "updated_at"])
        return success_response(correlation_id=correlation_id, data={"contract": _contract_to_representation(contract)})

