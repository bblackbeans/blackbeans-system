from __future__ import annotations

from factory import Faker
from factory import LazyAttribute
from factory import SubFactory
from factory.django import DjangoModelFactory

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import PermissionAssignment
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Workspace
from blackbeans_api.users.tests.factories import UserFactory


class WorkspaceFactory(DjangoModelFactory[Workspace]):
    name = Faker("company")

    class Meta:
        model = Workspace


class PortfolioFactory(DjangoModelFactory[Portfolio]):
    workspace = SubFactory(WorkspaceFactory)
    name = Faker("word")

    class Meta:
        model = Portfolio


class ProjectFactory(DjangoModelFactory[Project]):
    portfolio = SubFactory(PortfolioFactory)
    name = Faker("word")

    class Meta:
        model = Project


class BoardFactory(DjangoModelFactory[Board]):
    project = SubFactory(ProjectFactory)
    name = Faker("word")

    class Meta:
        model = Board


class PermissionAssignmentFactory(DjangoModelFactory[PermissionAssignment]):
    workspace = SubFactory(WorkspaceFactory)
    subject = SubFactory(UserFactory)
    scope_type = "workspace"
    scope_id = LazyAttribute(lambda o: o.workspace.pk)
    permission_key = "tasks.read"
    effect = PermissionAssignment.Effect.ALLOW

    class Meta:
        model = PermissionAssignment
