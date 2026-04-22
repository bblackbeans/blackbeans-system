from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import PermissionAssignment
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Workspace

User = get_user_model()

PERMISSION_KEYS: frozenset[str] = frozenset(
    {
        "tasks.read",
        "tasks.write",
        "boards.read",
        "boards.write",
    },
)

SCOPE_TYPES = frozenset({"workspace", "portfolio", "project", "board"})


class ScopeValidationError(Exception):
    pass


def scope_belongs_to_workspace(workspace: Workspace, scope_type: str, scope_id: uuid.UUID) -> None:
    if scope_type == "workspace":
        if scope_id != workspace.pk:
            raise ScopeValidationError("scope_id nao corresponde ao workspace.")
        return
    if scope_type == "portfolio":
        if not Portfolio.objects.filter(pk=scope_id, workspace=workspace).exists():
            raise ScopeValidationError("Portfolio inexistente ou fora do workspace.")
        return
    if scope_type == "project":
        if not Project.objects.filter(pk=scope_id, portfolio__workspace=workspace).exists():
            raise ScopeValidationError("Projeto inexistente ou fora do workspace.")
        return
    if scope_type == "board":
        if not Board.objects.filter(pk=scope_id, project__portfolio__workspace=workspace).exists():
            raise ScopeValidationError("Board inexistente ou fora do workspace.")
        return
    raise ScopeValidationError(f"scope_type invalido: {scope_type}")


def chain_leaf_to_workspace(
    workspace: Workspace,
    scope_type: str,
    scope_id: uuid.UUID,
) -> list[tuple[str, uuid.UUID]]:
    """Cadeia do escopo alvo ate workspace (inclusive), mais especifico primeiro."""
    if scope_type == "workspace":
        if scope_id != workspace.pk:
            raise ScopeValidationError("Escopo workspace inconsistente.")
        return [("workspace", scope_id)]
    if scope_type == "portfolio":
        try:
            p = Portfolio.objects.select_related("workspace").get(pk=scope_id)
        except ObjectDoesNotExist as exc:
            raise ScopeValidationError("Portfolio inexistente.") from exc
        if p.workspace_id != workspace.pk:
            raise ScopeValidationError("Portfolio fora do workspace.")
        return [("portfolio", p.pk), ("workspace", p.workspace_id)]
    if scope_type == "project":
        try:
            pr = Project.objects.select_related("portfolio__workspace").get(pk=scope_id)
        except ObjectDoesNotExist as exc:
            raise ScopeValidationError("Projeto inexistente.") from exc
        if pr.portfolio.workspace_id != workspace.pk:
            raise ScopeValidationError("Projeto fora do workspace.")
        return [
            ("project", pr.pk),
            ("portfolio", pr.portfolio_id),
            ("workspace", pr.portfolio.workspace_id),
        ]
    if scope_type == "board":
        try:
            b = Board.objects.select_related("project__portfolio__workspace").get(pk=scope_id)
        except ObjectDoesNotExist as exc:
            raise ScopeValidationError("Board inexistente.") from exc
        if b.project.portfolio.workspace_id != workspace.pk:
            raise ScopeValidationError("Board fora do workspace.")
        return [
            ("board", b.pk),
            ("project", b.project_id),
            ("portfolio", b.project.portfolio_id),
            ("workspace", b.project.portfolio.workspace_id),
        ]
    raise ScopeValidationError(f"scope_type invalido: {scope_type}")


def resolve_effective(
    workspace: Workspace,
    user: User,
    scope_type: str,
    scope_id: uuid.UUID,
    permission_key: str,
) -> tuple[str | None, str | None, PermissionAssignment | None]:
    """
    Mais especifico na cadeia vence: primeiro assignment encontrado a partir do escopo alvo.
    Retorna (effect, rule_source, winning_row).
    """
    chain = chain_leaf_to_workspace(workspace, scope_type, scope_id)
    for st, sid in chain:
        pa = (
            PermissionAssignment.objects.filter(
                workspace=workspace,
                subject=user,
                scope_type=st,
                scope_id=sid,
                permission_key=permission_key,
            )
            .select_related("workspace", "subject")
            .first()
        )
        if pa is not None:
            src = "specific" if (st == scope_type and sid == scope_id) else "inherited"
            return pa.effect, src, pa
    return None, None, None


def resolve_with_proposed_override(
    workspace: Workspace,
    user: User,
    scope_type: str,
    scope_id: uuid.UUID,
    permission_key: str,
    override_effect: str,
) -> tuple[str | None, str | None]:
    """Simula upsert de override_effect no escopo (scope_type, scope_id) para a chave."""
    chain = chain_leaf_to_workspace(workspace, scope_type, scope_id)
    for st, sid in chain:
        if st == scope_type and sid == scope_id:
            return override_effect, "specific"
        pa = PermissionAssignment.objects.filter(
            workspace=workspace,
            subject=user,
            scope_type=st,
            scope_id=sid,
            permission_key=permission_key,
        ).first()
        if pa is not None:
            src = "specific" if (st == scope_type and sid == scope_id) else "inherited"
            return pa.effect, src
    return None, None


def matrix_rows_for_workspace(
    workspace: Workspace,
    *,
    user_id: int | None = None,
    scope_type: str | None = None,
    scope_id: uuid.UUID | None = None,
) -> list[dict]:
    qs = PermissionAssignment.objects.filter(workspace=workspace).select_related("subject", "workspace")
    if user_id is not None:
        qs = qs.filter(subject_id=user_id)
    if scope_type is not None and scope_id is not None:
        qs = qs.filter(scope_type=scope_type, scope_id=scope_id)
    elif scope_type is not None or scope_id is not None:
        qs = qs.none()

    rows: list[dict] = []
    for pa in qs.order_by("subject_id", "scope_type", "permission_key"):
        try:
            eff, src, _ = resolve_effective(
                workspace,
                pa.subject,
                pa.scope_type,
                pa.scope_id,
                pa.permission_key,
            )
        except ScopeValidationError:
            continue
        rows.append(
            {
                "subject_type": "user",
                "subject_id": pa.subject_id,
                "scope_type": pa.scope_type,
                "scope_id": str(pa.scope_id),
                "permission_key": pa.permission_key,
                "stored_effect": pa.effect,
                "effective_effect": eff,
                "rule_source": src,
                "assignment_id": pa.pk,
            },
        )
    return rows


def build_conflict_preview(
    workspace: Workspace,
    user: User,
    scope_type: str,
    scope_id: uuid.UUID,
    permission_key: str,
    proposed_effect: str,
) -> dict:
    """Detecta diferenca entre efeito atual e efeito apos aplicar proposta no mesmo escopo."""
    cur_eff, cur_src, _ = resolve_effective(workspace, user, scope_type, scope_id, permission_key)
    sim_eff, sim_src = resolve_with_proposed_override(
        workspace,
        user,
        scope_type,
        scope_id,
        permission_key,
        proposed_effect,
    )
    if sim_eff == cur_eff:
        return {"conflict": None, "resolution_options": [], "impact": None}

    opts = [
        {
            "option_id": "apply_proposed",
            "label": "Aplicar permissao proposta neste escopo.",
            "effective_rule_summary": f"Apos aplicar: {sim_eff} ({sim_src}) em {scope_type}.",
        },
        {
            "option_id": "keep_current",
            "label": "Manter regra efetiva atual.",
            "effective_rule_summary": f"Mantem: {cur_eff} ({cur_src}).",
        },
    ]
    return {
        "conflict": {
            "permission_key": permission_key,
            "scope_type": scope_type,
            "scope_id": str(scope_id),
            "subject_id": user.pk,
            "current_effective": cur_eff,
            "current_rule_source": cur_src,
            "proposed_effect": proposed_effect,
            "simulated_effective": sim_eff,
            "simulated_rule_source": sim_src,
        },
        "resolution_options": opts,
        "impact": "Alteracao afeta avaliacao desta chave neste escopo na hierarquia.",
    }


def apply_resolution_option(
    workspace: Workspace,
    user: User,
    scope_type: str,
    scope_id: uuid.UUID,
    permission_key: str,
    proposed_effect: str,
    option_id: str,
) -> tuple[str, str]:
    """Retorna (before_summary, after_summary)."""
    before_eff, before_src, _ = resolve_effective(workspace, user, scope_type, scope_id, permission_key)
    before = f"effective={before_eff} source={before_src}"
    if option_id == "keep_current":
        return before, before
    if option_id == "apply_proposed":
        PermissionAssignment.objects.update_or_create(
            workspace=workspace,
            subject=user,
            scope_type=scope_type,
            scope_id=scope_id,
            permission_key=permission_key,
            defaults={"effect": proposed_effect},
        )
        after_eff, after_src, _ = resolve_effective(workspace, user, scope_type, scope_id, permission_key)
        after = f"effective={after_eff} source={after_src}"
        return before, after
    raise ValueError(f"option_id desconhecido: {option_id}")
