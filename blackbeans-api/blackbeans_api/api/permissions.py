from __future__ import annotations

from rest_framework.permissions import BasePermission
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
