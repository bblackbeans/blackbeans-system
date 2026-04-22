from __future__ import annotations

from factory import Faker
from factory.django import DjangoModelFactory

from blackbeans_api.clients.models import Client


class ClientFactory(DjangoModelFactory[Client]):
    name = Faker("company")
    status = Client.Status.ACTIVE
    description = Faker("sentence")

    class Meta:
        model = Client
