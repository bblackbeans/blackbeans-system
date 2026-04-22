from __future__ import annotations

import uuid

import pytest

from blackbeans_api.governance.services.bulk_permissions import validate_bulk_item
from blackbeans_api.governance.tests.factories import WorkspaceFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_validate_bulk_item_valid():
    ws = WorkspaceFactory.create()
    u = UserFactory.create()
    st, code, msg = validate_bulk_item(
        ws,
        subject_type="user",
        subject_id=u.pk,
        scope_type="workspace",
        scope_id=ws.pk,
        permission_key="tasks.read",
        effect="allow",
    )
    assert st == "valid"
    assert code is None
    assert msg is None


def test_validate_bulk_item_subject_missing():
    ws = WorkspaceFactory.create()
    st, code, _msg = validate_bulk_item(
        ws,
        subject_type="user",
        subject_id=42_424_242,
        scope_type="workspace",
        scope_id=ws.pk,
        permission_key="tasks.read",
        effect="allow",
    )
    assert st == "invalid"
    assert code == "subject_not_found"


def test_validate_bulk_item_scope_wrong_workspace():
    ws = WorkspaceFactory.create()
    u = UserFactory.create()
    st, code, _msg = validate_bulk_item(
        ws,
        subject_type="user",
        subject_id=u.pk,
        scope_type="workspace",
        scope_id=uuid.uuid4(),
        permission_key="tasks.read",
        effect="allow",
    )
    assert st == "invalid"
    assert code == "scope_not_found"
