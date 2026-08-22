from __future__ import annotations

import re
import unicodedata

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskStatusDefinition

STATUS_GROUP_BACKLOG = "Backlog"
STATUS_GROUP_PROGRESS = "Em andamento"
STATUS_GROUP_DONE = "Concluído"

_BACKLOG_TOKENS = {
    "backlog",
    "back log",
    "todo",
    "to do",
    "a fazer",
    "afazer",
    "a_fazer",
}
_DONE_TOKENS = {
    "done",
    "concluido",
    "concluida",
    "completed",
    "completo",
}


def normalize_status_token(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def compact_status_token(value: str | None) -> str:
    return normalize_status_token(value).replace(" ", "")


def status_bucket(status_key: str, *, label: str | None = None) -> str:
    """Mapa status → backlog | progress | done (key e label do catalogo)."""
    tokens = {normalize_status_token(status_key), compact_status_token(status_key)}
    if label:
        tokens.add(normalize_status_token(label))
        tokens.add(compact_status_token(label))
    if tokens & _BACKLOG_TOKENS or compact_status_token(status_key) in {"todo", "backlog", "afazer"}:
        return "backlog"
    if tokens & _DONE_TOKENS or compact_status_token(status_key) in {"done", "concluido", "concluida"}:
        return "done"
    row = None
    if status_key:
        row = TaskStatusDefinition.objects.filter(key=status_key, is_active=True).first()
        if row is None:
            row = TaskStatusDefinition.objects.filter(key__iexact=status_key, is_active=True).first()
    if row:
        if row.is_done_like:
            return "done"
        label_norm = normalize_status_token(row.label)
        compact = compact_status_token(row.label)
        if label_norm in _BACKLOG_TOKENS or compact in {"backlog", "todo", "afazer"}:
            return "backlog"
        if label_norm in _DONE_TOKENS or compact in {"done", "concluido", "concluida"}:
            return "done"
    return "progress"


def status_bucket_for_task(task: Task) -> str:
    row = TaskStatusDefinition.objects.filter(key=task.status, is_active=True).first()
    return status_bucket(task.status, label=row.label if row else None)


def group_name_aliases(bucket: str) -> set[str]:
    if bucket == "backlog":
        return {"backlog", "a fazer", "todo", "to do", "a-fazer"}
    if bucket == "done":
        return {"concluído", "concluido", "done", "concluída", "concluida", "concluida"}
    return {
        "em andamento",
        "in progress",
        "doing",
        "andamento",
        "em progresso",
        "liberado",
        "in_progress",
    }


def canonical_group_name(bucket: str) -> str:
    if bucket == "backlog":
        return STATUS_GROUP_BACKLOG
    if bucket == "done":
        return STATUS_GROUP_DONE
    return STATUS_GROUP_PROGRESS


def bucket_for_group_name(name: str) -> str | None:
    token = normalize_status_token(name)
    compact = compact_status_token(name)
    if token in group_name_aliases("backlog") or compact in {"backlog", "todo", "afazer"}:
        return "backlog"
    if token in {normalize_status_token(a) for a in group_name_aliases("done")} or compact in {
        "concluido",
        "concluida",
        "done",
    }:
        return "done"
    if token in {normalize_status_token(a) for a in group_name_aliases("progress")} or compact in {
        "emandamento",
        "emprogresso",
        "inprogress",
        "liberado",
    }:
        return "progress"
    return None


def find_or_create_status_group(board: Board, bucket: str) -> BoardGroup:
    aliases = {normalize_status_token(a) for a in group_name_aliases(bucket)}
    aliases.add(normalize_status_token(canonical_group_name(bucket)))
    for group in BoardGroup.objects.filter(board=board).order_by("position"):
        if normalize_status_token(group.name) in aliases:
            if group.name != canonical_group_name(bucket):
                group.name = canonical_group_name(bucket)
                group.save(update_fields=["name", "updated_at"] if hasattr(group, "updated_at") else ["name"])
            return group
    used = set(BoardGroup.objects.filter(board=board).values_list("position", flat=True))
    preferred = {"backlog": 1, "progress": 2, "done": 3}.get(bucket, 1)
    position = preferred if preferred not in used else 1
    while position in used:
        position += 1
    return BoardGroup.objects.create(
        board=board,
        name=canonical_group_name(bucket),
        position=position,
        wip_limit=999,
    )


def ensure_canonical_groups(board: Board) -> dict[str, BoardGroup]:
    return {
        "backlog": find_or_create_status_group(board, "backlog"),
        "progress": find_or_create_status_group(board, "progress"),
        "done": find_or_create_status_group(board, "done"),
    }


def catalog_key_for_bucket(bucket: str, *, current: str | None = None) -> str:
    rows = list(TaskStatusDefinition.objects.filter(is_active=True).order_by("position", "key"))
    if bucket == "done":
        for row in rows:
            if row.is_done_like or status_bucket(row.key, label=row.label) == "done":
                return row.key
        return Task.Status.DONE
    if bucket == "backlog":
        for row in rows:
            if status_bucket(row.key, label=row.label) == "backlog":
                return row.key
        return Task.Status.TODO
    if current and status_bucket(current) == "progress":
        return current
    for row in rows:
        if status_bucket(row.key, label=row.label) == "progress":
            if compact_status_token(row.key) in {"inprogress", "emandamento"}:
                return row.key
    for row in rows:
        if status_bucket(row.key, label=row.label) == "progress":
            return row.key
    return Task.Status.IN_PROGRESS


def done_catalog_key() -> str:
    return catalog_key_for_bucket("done")


def sync_task_group_by_status(task: Task) -> bool:
    bucket = status_bucket_for_task(task)
    target = find_or_create_status_group(task.board, bucket)
    if task.group_id == target.pk:
        return False
    task.group = target
    task.save(update_fields=["group", "updated_at"])
    return True


def apply_status_from_group(task: Task) -> bool:
    """Ao mover a coluna no quadro, alinha o status ao bucket da coluna."""
    bucket = bucket_for_group_name(task.group.name if task.group_id else "") or status_bucket_for_task(task)
    desired = catalog_key_for_bucket(bucket, current=task.status)
    if task.status == desired:
        return False
    task.status = desired
    return True


def _first_group_for_board(board: Board) -> BoardGroup:
    group = BoardGroup.objects.filter(board=board).order_by("position", "created_at").first()
    if group is not None:
        return group
    return BoardGroup.objects.create(board=board, name="Lista principal", position=1, wip_limit=999)


def find_board_for_pull_status(*, project_id, status_key: str, exclude_board_id=None) -> Board | None:
    """Retorna o board do projeto que declara status_key em pull_status_keys."""
    key = str(status_key or "").strip()
    if not key:
        return None
    qs = Board.objects.filter(project_id=project_id)
    if exclude_board_id is not None:
        qs = qs.exclude(pk=exclude_board_id)
    for board in qs.iterator():
        keys = board.pull_status_keys or []
        if not isinstance(keys, list):
            continue
        if key in keys or key.lower() in {str(k).lower() for k in keys}:
            return board
    return None


def sync_task_board_by_pull_status(task: Task) -> bool:
    """
    Move a tarefa para o board do mesmo projeto que 'puxa' o status atual.
    Retorna True se board (e group) mudaram.
    """
    if not task.board_id:
        return False
    project_id = task.board.project_id if task.board_id else None
    if project_id is None:
        # refresh relation
        task = Task.objects.select_related("board").get(pk=task.pk)
        project_id = task.board.project_id
    target = find_board_for_pull_status(project_id=project_id, status_key=task.status)
    if target is None or target.pk == task.board_id:
        return False
    group = _first_group_for_board(target)
    task.board = target
    task.group = group
    task.save(update_fields=["board", "group", "updated_at"])
    return True


def realign_project_tasks_by_pull_status(*, project_id) -> int:
    """Reposiciona tarefas do projeto conforme pull_status_keys dos boards. Retorna qtd movida."""
    moved = 0
    tasks = Task.objects.filter(board__project_id=project_id).select_related("board", "group")
    for task in tasks.iterator(chunk_size=200):
        if sync_task_board_by_pull_status(task):
            moved += 1
            task.refresh_from_db()
            sync_task_group_by_status(task)
    return moved


def validate_pull_status_keys_unique(*, project_id, board_id, keys: list[str]) -> list[str]:
    """Retorna lista de keys em conflito com outros boards do projeto."""
    normalized = [str(k).strip() for k in (keys or []) if str(k).strip()]
    if not normalized:
        return []
    conflicts: list[str] = []
    lower_wanted = {k.lower(): k for k in normalized}
    for other in Board.objects.filter(project_id=project_id).exclude(pk=board_id):
        other_keys = other.pull_status_keys or []
        if not isinstance(other_keys, list):
            continue
        for ok in other_keys:
            ok_s = str(ok).strip()
            if ok_s.lower() in lower_wanted:
                conflicts.append(lower_wanted[ok_s.lower()])
    return sorted(set(conflicts))
