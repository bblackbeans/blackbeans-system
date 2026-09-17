from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from blackbeans_api.clients.models import Client


CLIENT_PORTAL_ROLE = "client_portal"


@dataclass
class ClientPortalPrincipal:
    client: Client

    @property
    def pk(self):
        return self.client.pk

    @property
    def id(self):
        return self.client.pk

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    @property
    def is_staff(self) -> bool:
        return False

    @property
    def is_superuser(self) -> bool:
        return False


def issue_client_portal_access_token(client: Client) -> str:
    token = AccessToken()
    token["role"] = CLIENT_PORTAL_ROLE
    token["client_id"] = str(client.pk)
    token["portal_username"] = client.portal_username or ""
    token["client_name"] = client.name
    return str(token)


class ClientPortalJWTAuthentication(BaseAuthentication):
    """Autentica JWT com role=client_portal (sem User Django)."""

    def authenticate(self, request: Request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith("Bearer "):
            return None
        raw = header[7:].strip()
        if not raw:
            return None
        try:
            token = AccessToken(raw)
        except TokenError as exc:
            raise AuthenticationFailed("Token invalido ou expirado.") from exc

        if token.get("role") != CLIENT_PORTAL_ROLE:
            return None

        client_id = token.get("client_id")
        if not client_id:
            raise AuthenticationFailed("Token de portal sem client_id.")

        try:
            client = Client.objects.get(pk=UUID(str(client_id)))
        except (Client.DoesNotExist, ValueError, TypeError) as exc:
            raise AuthenticationFailed("Cliente do portal nao encontrado.") from exc

        if not client.portal_enabled:
            raise AuthenticationFailed("Acesso ao portal desativado para esta empresa.")
        if client.status != Client.Status.ACTIVE:
            raise AuthenticationFailed("Cliente inativo.")

        return (ClientPortalPrincipal(client=client), token)


class IsClientPortal(BasePermission):
    message = "Acesso restrito ao portal do cliente."

    def has_permission(self, request: Request, view) -> bool:
        user = request.user
        return isinstance(user, ClientPortalPrincipal) and bool(user.is_authenticated)
