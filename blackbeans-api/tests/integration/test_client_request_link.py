from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from blackbeans_api.api.client_portal_auth import issue_client_portal_access_token
from blackbeans_api.clients.tests.factories import ClientFactory
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import ClientRequest
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.tests.factories import BoardFactory
from blackbeans_api.governance.tests.factories import PortfolioFactory
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.governance.tests.factories import WorkspaceFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def admin_client():
    admin = UserFactory.create(password=STRONG_PASSWORD, is_staff=True, is_active=True, is_superuser=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


def test_patch_links_new_and_converted_requests(admin_client):
    company = ClientFactory.create(name="Cliente Portal")
    fresh = ClientRequest.objects.create(
        client_name="Texto livre",
        title="Pedido novo",
        status=ClientRequest.Status.NEW,
    )
    converted = ClientRequest.objects.create(
        client_name="Outro",
        title="Pedido convertido",
        status=ClientRequest.Status.CONVERTED,
    )

    fresh_response = admin_client.patch(
        f"/api/v1/client-requests/{fresh.pk}",
        {"client_id": str(company.pk)},
        format="json",
    )
    assert fresh_response.status_code == 200
    assert fresh_response.data["data"]["request"]["status"] == "new"
    assert fresh_response.data["data"]["request"]["client_id"] == str(company.pk)
    assert fresh_response.data["data"]["request"]["linked_client_name"] == "Cliente Portal"

    converted_response = admin_client.patch(
        f"/api/v1/client-requests/{converted.pk}",
        {"client_id": str(company.pk)},
        format="json",
    )
    assert converted_response.status_code == 200
    assert converted_response.data["data"]["request"]["status"] == "converted"
    assert converted_response.data["data"]["request"]["client_id"] == str(company.pk)

    unlink = admin_client.patch(
        f"/api/v1/client-requests/{fresh.pk}",
        {"client_id": None},
        format="json",
    )
    assert unlink.status_code == 200
    assert unlink.data["data"]["request"]["client_id"] is None


def test_portal_area_shows_tasks_from_linked_portfolio(admin_client):
    company = ClientFactory.create(
        name="Cliente Portal",
        portal_enabled=True,
        portal_username="empresa.login",
        status="active",
    )
    company.set_portal_password("secret")
    company.save(update_fields=["portal_password_hash"])
    workspace = WorkspaceFactory.create(name="Producao", client=company)
    portfolio = PortfolioFactory.create(workspace=workspace, name="Contas ativas")
    other_portfolio = PortfolioFactory.create(workspace=workspace, name="Outro")
    company.portal_portfolio = portfolio
    company.save(update_fields=["portal_portfolio"])

    project = ProjectFactory.create(portfolio=portfolio, name="App")
    other_project = ProjectFactory.create(portfolio=other_portfolio, name="Fora")
    board = BoardFactory.create(project=project, name="Backlog")
    group = BoardGroup.objects.create(board=board, name="A fazer", position=1)
    task = Task.objects.create(board=board, group=group, title="Entregar diagnostico")
    other_board = BoardFactory.create(project=other_project, name="Backlog")
    other_group = BoardGroup.objects.create(board=other_board, name="A fazer", position=1)
    other_task = Task.objects.create(board=other_board, group=other_group, title="Nao mostrar")

    ClientRequest.objects.create(
        client=company,
        client_name=company.name,
        title="Pedido no portfolio",
        status=ClientRequest.Status.CONVERTED,
        converted_task=task,
        converted_project=project,
    )
    ClientRequest.objects.create(
        client=company,
        client_name=company.name,
        title="Pedido fora",
        status=ClientRequest.Status.CONVERTED,
        converted_task=other_task,
        converted_project=other_project,
    )
    ClientRequest.objects.create(
        client=company,
        client_name=company.name,
        title="Pedido ainda novo",
        status=ClientRequest.Status.NEW,
    )

    patch = admin_client.patch(
        f"/api/v1/clients/{company.pk}",
        {"portal_portfolio_id": str(portfolio.pk)},
        format="json",
    )
    assert patch.status_code == 200
    assert patch.data["data"]["client"]["portal_portfolio_id"] == str(portfolio.pk)
    assert patch.data["data"]["client"]["portal_portfolio_name"] == "Contas ativas"

    token = issue_client_portal_access_token(company)
    portal = APIClient()
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    area = portal.get("/api/v1/client-portal/area", **auth)
    assert area.status_code == 200
    payload = area.data["data"]
    assert payload["workspace"]["name"] == "Producao"
    assert payload["portfolio"]["name"] == "Contas ativas"
    assert [row["title"] for row in payload["tasks"]] == ["Entregar diagnostico"]

    requests_response = portal.get("/api/v1/client-portal/requests", **auth)
    assert requests_response.status_code == 200
    titles = {row["title"] for row in requests_response.data["data"]["requests"]}
    assert {"Pedido ainda novo", "Pedido no portfolio", "Pedido fora"} <= titles
