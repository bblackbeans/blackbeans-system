from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from blackbeans_api.governance.models import PermissionAssignment
from blackbeans_api.governance.models import PermissionBulkPreview
from blackbeans_api.governance.tests.factories import PermissionAssignmentFactory
from blackbeans_api.governance.tests.factories import PortfolioFactory
from blackbeans_api.governance.tests.factories import ProjectFactory
from blackbeans_api.governance.tests.factories import WorkspaceFactory
from blackbeans_api.users.tests.factories import UserFactory
from tests.integration.auth_helpers import obtain_admin_access_token

pytestmark = pytest.mark.django_db

STRONG_PASSWORD = "Str0ng!PassWord#1"


@pytest.fixture
def superadmin_client():
    password = STRONG_PASSWORD
    admin = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )
    client = APIClient()
    token = obtain_admin_access_token(client, username=admin.username, password=password)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, admin


@pytest.fixture
def staff_non_super_client():
    password = STRONG_PASSWORD
    user = UserFactory.create(
        password=password,
        is_staff=True,
        is_active=True,
        is_superuser=False,
    )
    client = APIClient()
    token = obtain_admin_access_token(client, username=user.username, password=password)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, user


def test_matrix_requires_workspace_id(superadmin_client):
    client, _ = superadmin_client
    r = client.get("/api/v1/permissions/matrix")
    assert r.status_code == 400
    assert r.data["error"]["code"] == "validation_error"


def test_matrix_workspace_not_found(superadmin_client):
    client, _ = superadmin_client
    r = client.get(f"/api/v1/permissions/matrix?workspace_id={uuid.uuid4()}")
    assert r.status_code == 404
    assert r.data["error"]["code"] == "workspace_not_found"


def test_matrix_returns_rows_with_rule_source(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    PermissionAssignmentFactory.create(
        workspace=ws,
        subject=target,
        scope_type="workspace",
        permission_key="tasks.read",
        effect=PermissionAssignment.Effect.DENY,
    )
    pf = PortfolioFactory.create(workspace=ws)
    PermissionAssignmentFactory.create(
        workspace=ws,
        subject=target,
        scope_type="portfolio",
        scope_id=pf.pk,
        permission_key="tasks.read",
        effect=PermissionAssignment.Effect.ALLOW,
    )

    r = client.get(f"/api/v1/permissions/matrix?workspace_id={ws.pk}")
    assert r.status_code == 200
    matrix = r.data["data"]["matrix"]
    assert r.data["meta"]["count"] == 2
    portfolio_row = next(x for x in matrix if x["scope_type"] == "portfolio")
    assert portfolio_row["stored_effect"] == "allow"
    assert portfolio_row["effective_effect"] == "allow"
    assert portfolio_row["rule_source"] == "specific"


def test_staff_non_super_cannot_post_assignments(staff_non_super_client):
    client, _user = staff_non_super_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    r = client.post(
        "/api/v1/permissions/assignments",
        {
            "workspace_id": str(ws.pk),
            "subject_type": "user",
            "subject_id": target.pk,
            "scope_type": "workspace",
            "scope_id": str(ws.pk),
            "permission_key": "tasks.read",
            "effect": "allow",
        },
        format="json",
    )
    assert r.status_code == 403
    assert r.data["error"]["code"] == "forbidden"


def test_superuser_upsert_assignment(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    body = {
        "workspace_id": str(ws.pk),
        "subject_type": "user",
        "subject_id": target.pk,
        "scope_type": "workspace",
        "scope_id": str(ws.pk),
        "permission_key": "tasks.write",
        "effect": "allow",
    }
    r1 = client.post("/api/v1/permissions/assignments", body, format="json")
    assert r1.status_code == 201
    assert r1.data["data"]["created"] is True
    r2 = client.post("/api/v1/permissions/assignments", body, format="json")
    assert r2.status_code == 200
    assert r2.data["data"]["created"] is False


def test_assignment_scope_not_found(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    r = client.post(
        "/api/v1/permissions/assignments",
        {
            "workspace_id": str(ws.pk),
            "subject_type": "user",
            "subject_id": target.pk,
            "scope_type": "board",
            "scope_id": str(uuid.uuid4()),
            "permission_key": "boards.read",
            "effect": "allow",
        },
        format="json",
    )
    assert r.status_code == 404
    assert r.data["error"]["code"] == "scope_not_found"


def test_conflict_preview_and_resolve(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    proj = ProjectFactory.create(portfolio=PortfolioFactory.create(workspace=ws))

    PermissionAssignmentFactory.create(
        workspace=ws,
        subject=target,
        scope_type="workspace",
        scope_id=ws.pk,
        permission_key="tasks.write",
        effect=PermissionAssignment.Effect.DENY,
    )

    preview = client.post(
        "/api/v1/permissions/conflicts/resolve-preview",
        {
            "workspace_id": str(ws.pk),
            "context": {
                "subject_type": "user",
                "subject_id": target.pk,
                "scope_type": "project",
                "scope_id": str(proj.pk),
                "permission_key": "tasks.write",
            },
            "proposed": {"effect": "allow"},
        },
        format="json",
    )
    assert preview.status_code == 200
    assert preview.data["data"]["conflict"] is not None
    assert len(preview.data["data"]["resolution_options"]) == 2

    resolve = client.post(
        "/api/v1/permissions/conflicts/resolve",
        {
            "workspace_id": str(ws.pk),
            "context": {
                "subject_type": "user",
                "subject_id": target.pk,
                "scope_type": "project",
                "scope_id": str(proj.pk),
                "permission_key": "tasks.write",
            },
            "proposed": {"effect": "allow"},
            "option_id": "apply_proposed",
        },
        format="json",
    )
    assert resolve.status_code == 200
    pa = PermissionAssignment.objects.get(
        workspace=ws,
        subject=target,
        scope_type="project",
        scope_id=proj.pk,
        permission_key="tasks.write",
    )
    assert pa.effect == PermissionAssignment.Effect.ALLOW


def test_matrix_filter_by_user(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u1 = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    u2 = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    PermissionAssignmentFactory.create(workspace=ws, subject=u1)
    PermissionAssignmentFactory.create(workspace=ws, subject=u2)

    r = client.get(f"/api/v1/permissions/matrix?workspace_id={ws.pk}&user_id={u1.pk}")
    assert r.status_code == 200
    assert len(r.data["data"]["matrix"]) == 1


def test_matrix_scope_not_found(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    r = client.get(
        f"/api/v1/permissions/matrix?workspace_id={ws.pk}&scope_type=board&scope_id={uuid.uuid4()}",
    )
    assert r.status_code == 404
    assert r.data["error"]["code"] == "scope_not_found"


def test_staff_can_preview_conflict_but_not_resolve(staff_non_super_client):
    client, user = staff_non_super_client
    ws = WorkspaceFactory.create()
    proj = ProjectFactory.create(portfolio=PortfolioFactory.create(workspace=ws))
    preview = client.post(
        "/api/v1/permissions/conflicts/resolve-preview",
        {
            "workspace_id": str(ws.pk),
            "context": {
                "subject_type": "user",
                "subject_id": user.pk,
                "scope_type": "project",
                "scope_id": str(proj.pk),
                "permission_key": "tasks.read",
            },
            "proposed": {"effect": "allow"},
        },
        format="json",
    )
    assert preview.status_code == 200

    resolve = client.post(
        "/api/v1/permissions/conflicts/resolve",
        {
            "workspace_id": str(ws.pk),
            "context": {
                "subject_type": "user",
                "subject_id": user.pk,
                "scope_type": "project",
                "scope_id": str(proj.pk),
                "permission_key": "tasks.read",
            },
            "proposed": {"effect": "allow"},
            "option_id": "apply_proposed",
        },
        format="json",
    )
    assert resolve.status_code == 403


def test_conflict_preview_no_conflict_when_effective_unchanged(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    proj = ProjectFactory.create(portfolio=PortfolioFactory.create(workspace=ws))
    PermissionAssignmentFactory.create(
        workspace=ws,
        subject=target,
        scope_type="workspace",
        scope_id=ws.pk,
        permission_key="tasks.read",
        effect=PermissionAssignment.Effect.DENY,
    )
    preview = client.post(
        "/api/v1/permissions/conflicts/resolve-preview",
        {
            "workspace_id": str(ws.pk),
            "context": {
                "subject_type": "user",
                "subject_id": target.pk,
                "scope_type": "project",
                "scope_id": str(proj.pk),
                "permission_key": "tasks.read",
            },
            "proposed": {"effect": "deny"},
        },
        format="json",
    )
    assert preview.status_code == 200
    assert preview.data["data"]["conflict"] is None
    assert preview.data["data"]["resolution_options"] == []


def test_matrix_skips_orphan_portfolio_scope(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    PermissionAssignment.objects.create(
        workspace=ws,
        subject=target,
        scope_type="portfolio",
        scope_id=uuid.uuid4(),
        permission_key="tasks.read",
        effect=PermissionAssignment.Effect.ALLOW,
    )
    r = client.get(f"/api/v1/permissions/matrix?workspace_id={ws.pk}")
    assert r.status_code == 200
    assert r.data["data"]["matrix"] == []
    assert r.data["meta"]["count"] == 0


def test_staff_non_super_cannot_bulk_preview(staff_non_super_client):
    client, _user = staff_non_super_client
    ws = WorkspaceFactory.create()
    r = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": _user.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    assert r.status_code == status.HTTP_403_FORBIDDEN
    assert r.data["error"]["code"] == "forbidden"


def test_staff_non_super_cannot_bulk_apply(staff_non_super_client):
    client, _user = staff_non_super_client
    r = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": str(uuid.uuid4())},
        format="json",
    )
    assert r.status_code == status.HTTP_403_FORBIDDEN
    assert r.data["error"]["code"] == "forbidden"


@override_settings(BULK_PERMISSIONS_MAX_ITEMS=2)
def test_bulk_preview_rejects_too_many_items(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    item = {
        "subject_type": "user",
        "subject_id": u.pk,
        "scope_type": "workspace",
        "scope_id": str(ws.pk),
        "permission_key": "tasks.read",
        "effect": "allow",
    }
    r = client.post(
        "/api/v1/permissions/bulk/preview",
        {"workspace_id": str(ws.pk), "items": [item, item, item]},
        format="json",
    )
    assert r.status_code == status.HTTP_400_BAD_REQUEST
    assert r.data["error"]["code"] == "validation_error"


def test_bulk_preview_mixed_and_apply_partial(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    ok_user = UserFactory.create(
        password=STRONG_PASSWORD,
        is_staff=False,
        is_active=True,
    )
    pr = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": ok_user.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.write",
                    "effect": "allow",
                },
                {
                    "subject_type": "user",
                    "subject_id": 9_999_999,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "boards.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    assert pr.status_code == status.HTTP_200_OK
    assert pr.data["meta"]["expires_at"]
    assert len(pr.data["data"]["valid_items"]) == 1
    assert len(pr.data["data"]["invalid_items"]) == 1
    assert pr.data["data"]["invalid_items"][0]["reason_code"] == "subject_not_found"
    preview_id = pr.data["data"]["preview_id"]
    pending = PermissionAssignment.objects.filter(
        workspace=ws,
        subject=ok_user,
        permission_key="tasks.write",
    )
    assert pending.count() == 0

    ap = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": preview_id},
        format="json",
    )
    assert ap.status_code == status.HTTP_200_OK
    assert ap.data["data"]["processed"] == 2
    assert ap.data["data"]["succeeded"] == 1
    assert ap.data["data"]["failed"] == 1
    assert ap.data["data"]["failures"][0]["reason_code"] == "subject_not_found"
    pa = PermissionAssignment.objects.get(
        workspace=ws,
        subject=ok_user,
        permission_key="tasks.write",
    )
    assert pa.effect == PermissionAssignment.Effect.ALLOW


def test_bulk_apply_forbidden_when_actor_is_not_preview_creator(superadmin_client):
    """Decisao code review: apenas `created_by` pode aplicar o preview."""
    client_creator, creator = superadmin_client
    client_other = APIClient()
    other = UserFactory.create(
        password=STRONG_PASSWORD,
        is_staff=True,
        is_active=True,
        is_superuser=True,
    )
    token_other = obtain_admin_access_token(
        client_other,
        username=other.username,
        password=STRONG_PASSWORD,
    )
    client_other.credentials(HTTP_AUTHORIZATION=f"Bearer {token_other}")

    ws = WorkspaceFactory.create()
    target = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    pr = client_creator.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": target.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    assert pr.status_code == status.HTTP_200_OK
    preview_id = pr.data["data"]["preview_id"]

    denied = client_other.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": preview_id},
        format="json",
    )
    assert denied.status_code == status.HTTP_403_FORBIDDEN
    assert denied.data["error"]["code"] == "forbidden"

    ok = client_creator.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": preview_id},
        format="json",
    )
    assert ok.status_code == status.HTTP_200_OK


def test_bulk_apply_preview_not_found(superadmin_client):
    client, _admin = superadmin_client
    r = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": str(uuid.uuid4())},
        format="json",
    )
    assert r.status_code == status.HTTP_404_NOT_FOUND
    assert r.data["error"]["code"] == "preview_not_found"
    assert r.data["correlation_id"]


def test_bulk_apply_preview_already_applied(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    pr = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": u.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "boards.write",
                    "effect": "deny",
                },
            ],
        },
        format="json",
    )
    pid = pr.data["data"]["preview_id"]
    first_apply = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": pid},
        format="json",
    )
    assert first_apply.status_code == status.HTTP_200_OK
    r2 = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": pid},
        format="json",
    )
    assert r2.status_code == status.HTTP_409_CONFLICT
    assert r2.data["error"]["code"] == "preview_already_applied"


def test_bulk_apply_preview_expired(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    pr = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": u.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    pid = pr.data["data"]["preview_id"]
    past = timezone.now() - timedelta(hours=2)
    PermissionBulkPreview.objects.filter(pk=pid).update(expires_at=past)
    r = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": pid},
        format="json",
    )
    assert r.status_code == status.HTTP_409_CONFLICT
    assert r.data["error"]["code"] == "preview_expired"
    refreshed = PermissionBulkPreview.objects.get(pk=pid)
    assert refreshed.status == PermissionBulkPreview.Status.EXPIRED
    no_assign = PermissionAssignment.objects.filter(
        workspace=ws,
        subject=u,
        permission_key="tasks.read",
    )
    assert no_assign.count() == 0


def test_bulk_apply_ignores_invalid_rows_in_snapshot(superadmin_client):
    """Snapshot com linha invalida nao deve ser aplicada mesmo que presente no JSON."""
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    pr = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": u.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    preview = PermissionBulkPreview.objects.get(pk=pr.data["data"]["preview_id"])
    items = preview.items_json["items"]
    items.append(
        {
            "item_index": 99,
            "subject_type": "user",
            "subject_id": u.pk,
            "scope_type": "workspace",
            "scope_id": str(ws.pk),
            "permission_key": "boards.read",
            "effect": "allow",
            "row_status": "invalid",
            "reason_code": "injected",
            "message": "x",
        },
    )
    preview.items_json = {"version": 1, "items": items}
    preview.save(update_fields=["items_json", "updated_at"])

    ap = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": str(preview.pk)},
        format="json",
    )
    assert ap.status_code == status.HTTP_200_OK
    assert ap.data["data"]["processed"] == 2
    assert ap.data["data"]["failed"] == 1
    assert ap.data["data"]["failures"][0]["reason_code"] == "injected"
    boards_assign = PermissionAssignment.objects.filter(
        workspace=ws,
        subject=u,
        permission_key="boards.read",
    )
    assert boards_assign.count() == 0


def test_bulk_apply_invalid_preview_payload_returns_invalid_state(superadmin_client):
    client, _admin = superadmin_client
    ws = WorkspaceFactory.create()
    u = UserFactory.create(password=STRONG_PASSWORD, is_staff=False, is_active=True)
    pr = client.post(
        "/api/v1/permissions/bulk/preview",
        {
            "workspace_id": str(ws.pk),
            "items": [
                {
                    "subject_type": "user",
                    "subject_id": u.pk,
                    "scope_type": "workspace",
                    "scope_id": str(ws.pk),
                    "permission_key": "tasks.read",
                    "effect": "allow",
                },
            ],
        },
        format="json",
    )
    preview = PermissionBulkPreview.objects.get(pk=pr.data["data"]["preview_id"])
    preview.items_json = {"version": 1, "items": "corrupted"}
    preview.save(update_fields=["items_json", "updated_at"])

    ap = client.post(
        "/api/v1/permissions/bulk/apply",
        {"preview_id": str(preview.pk)},
        format="json",
    )
    assert ap.status_code == status.HTTP_409_CONFLICT
    assert ap.data["error"]["code"] == "preview_invalid_state"
