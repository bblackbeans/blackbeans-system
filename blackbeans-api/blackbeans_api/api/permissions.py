from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.permissions import SAFE_METHODS
from rest_framework.request import Request

from blackbeans_api.users.models import UserAdminAreaAccess


def user_has_admin_area(user, area_key: str) -> bool:
    """Staff/superuser tem todas as areas; colaborador so as liberadas."""
    if not (user and getattr(user, "is_authenticated", False)):
        return False
    if user.is_staff or user.is_superuser:
        return True
    return UserAdminAreaAccess.objects.filter(user_id=user.pk, area_key=area_key).exists()


def HasStaffOrAdminArea(area_key: str) -> type[BasePermission]:
    """Factory: staff/superuser OU grant da area_key."""

    class _HasStaffOrAdminArea(BasePermission):
        message = "Acesso restrito a perfil administrativo ou area liberada."

        def has_permission(self, request: Request, view) -> bool:
            return user_has_admin_area(request.user, area_key)

    _HasStaffOrAdminArea.__name__ = f"HasStaffOrAdminArea_{area_key.replace('-', '_')}"
    _HasStaffOrAdminArea.__qualname__ = _HasStaffOrAdminArea.__name__
    return _HasStaffOrAdminArea


def IsAuthenticatedReadElseStaffOrAdminArea(area_key: str) -> type[BasePermission]:
    """Leitura autenticada; escrita para staff/superuser ou grant da area."""

    class _IsAuthenticatedReadElseStaffOrAdminArea(BasePermission):
        message = "Acesso de escrita restrito a perfil administrativo ou area liberada."

        def has_permission(self, request: Request, view) -> bool:
            user = request.user
            if not (user and user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return True
            return user_has_admin_area(user, area_key)

    _IsAuthenticatedReadElseStaffOrAdminArea.__name__ = (
        f"IsAuthenticatedReadElseStaffOrAdminArea_{area_key.replace('-', '_')}"
    )
    _IsAuthenticatedReadElseStaffOrAdminArea.__qualname__ = (
        _IsAuthenticatedReadElseStaffOrAdminArea.__name__
    )
    return _IsAuthenticatedReadElseStaffOrAdminArea


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
