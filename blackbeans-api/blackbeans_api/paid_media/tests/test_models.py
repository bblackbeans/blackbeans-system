import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db import transaction

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Workspace
from blackbeans_api.paid_media.models import MetaAdAccountLink
from blackbeans_api.paid_media.models import PaidMediaConnection

pytestmark = pytest.mark.django_db


def make_workspace(name: str) -> tuple[Client, Workspace]:
    client = Client.objects.create(name=f"{name} client")
    workspace = Workspace.objects.create(name=name, client=client)
    return client, workspace


def make_link(
    *,
    workspace: Workspace,
    client: Client,
    connection: PaidMediaConnection,
    external_account_id: str = "123456789",
) -> MetaAdAccountLink:
    return MetaAdAccountLink.objects.create(
        workspace=workspace,
        client=client,
        connection=connection,
        external_account_id=external_account_id,
    )


def test_connection_is_active_and_unique_per_workspace_and_provider():
    _, workspace = make_workspace("Workspace A")

    connection = PaidMediaConnection.objects.create(workspace=workspace)

    assert connection.provider == PaidMediaConnection.Provider.META
    assert connection.is_active is True
    with pytest.raises(IntegrityError), transaction.atomic():
        PaidMediaConnection.objects.create(workspace=workspace)


def test_connection_for_another_workspace_does_not_collide():
    _, first_workspace = make_workspace("Workspace A")
    _, second_workspace = make_workspace("Workspace B")

    first = PaidMediaConnection.objects.create(workspace=first_workspace)
    second = PaidMediaConnection.objects.create(workspace=second_workspace)

    assert first.workspace_id != second.workspace_id


def test_link_persists_relationships_and_normalizes_external_id():
    client, workspace = make_workspace("Workspace A")
    connection = PaidMediaConnection.objects.create(workspace=workspace)

    link = make_link(
        workspace=workspace,
        client=client,
        connection=connection,
        external_account_id="  123456789  ",
    )

    link.refresh_from_db()
    assert link.workspace == workspace
    assert link.client == client
    assert link.connection == connection
    assert link.external_account_id == "123456789"
    assert link.is_active is True


def test_external_account_is_unique_within_workspace():
    client, workspace = make_workspace("Workspace A")
    connection = PaidMediaConnection.objects.create(workspace=workspace)
    make_link(workspace=workspace, client=client, connection=connection)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_link(workspace=workspace, client=client, connection=connection)


def test_same_external_account_is_allowed_and_scoped_across_workspaces():
    first_client, first_workspace = make_workspace("Workspace A")
    second_client, second_workspace = make_workspace("Workspace B")
    first_connection = PaidMediaConnection.objects.create(workspace=first_workspace)
    second_connection = PaidMediaConnection.objects.create(workspace=second_workspace)
    first_link = make_link(
        workspace=first_workspace,
        client=first_client,
        connection=first_connection,
    )
    make_link(
        workspace=second_workspace,
        client=second_client,
        connection=second_connection,
    )

    assert list(MetaAdAccountLink.objects.eligible_for(first_workspace)) == [first_link]


def test_link_rejects_connection_from_another_workspace():
    client, workspace = make_workspace("Workspace A")
    _, other_workspace = make_workspace("Workspace B")
    other_connection = PaidMediaConnection.objects.create(workspace=other_workspace)

    with pytest.raises(
        ValidationError,
        match=r"connection.*workspace",
    ):
        make_link(
            workspace=workspace,
            client=client,
            connection=other_connection,
        )


def test_link_rejects_client_not_associated_with_workspace():
    _, workspace = make_workspace("Workspace A")
    other_client = Client.objects.create(name="Other client")
    connection = PaidMediaConnection.objects.create(workspace=workspace)

    with pytest.raises(
        ValidationError,
        match=r"client.*workspace",
    ):
        make_link(
            workspace=workspace,
            client=other_client,
            connection=connection,
        )


def test_link_rejects_blank_external_account_id_after_trimming():
    client, workspace = make_workspace("Workspace A")
    connection = PaidMediaConnection.objects.create(workspace=workspace)

    with pytest.raises(ValidationError, match="external_account_id"):
        make_link(
            workspace=workspace,
            client=client,
            connection=connection,
            external_account_id="   ",
        )


def test_inactive_link_is_preserved_and_not_eligible():
    client, workspace = make_workspace("Workspace A")
    connection = PaidMediaConnection.objects.create(workspace=workspace)
    link = make_link(workspace=workspace, client=client, connection=connection)

    link.is_active = False
    link.save()

    assert MetaAdAccountLink.objects.filter(pk=link.pk).exists()
    assert not (
        MetaAdAccountLink.objects.eligible_for(workspace).filter(pk=link.pk).exists()
    )


def test_link_with_inactive_connection_is_not_eligible():
    client, workspace = make_workspace("Workspace A")
    connection = PaidMediaConnection.objects.create(workspace=workspace)
    link = make_link(workspace=workspace, client=client, connection=connection)

    connection.is_active = False
    connection.save()

    assert MetaAdAccountLink.objects.filter(pk=link.pk, is_active=True).exists()
    assert not (
        MetaAdAccountLink.objects.eligible_for(workspace).filter(pk=link.pk).exists()
    )
