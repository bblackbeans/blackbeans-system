from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.permissions import SAFE_METHODS
from rest_framework.request import Request


class IsStaffOrSuperuser(BasePermission):
    """Apenas usuarios staff ou superuser (administrativo)."""

    message = "Acesso restrito a perfil administrativo."

    def has_permission(self, request: Request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser),
        )


class IsSuperuser(BasePermission):
    """Apenas superusuario (mutacoes de governanca RBAC — story 1.6 MVP)."""

    message = "Acesso restrito a superusuario."

    def has_permission(self, request: Request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsAuthenticatedReadElseStaff(BasePermission):
    """Permite leitura autenticada; mutacoes apenas para staff/superuser."""

    message = "Acesso de escrita restrito a perfil administrativo."

    def has_permission(self, request: Request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(user.is_staff or user.is_superuser)
