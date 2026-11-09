"""Sinais que transformam alteracoes de Task/TaskComment em eventos de automacao."""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.db.models.signals import pre_save
from django.dispatch import receiver

from blackbeans_api.automations import engine
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskComment

logger = logging.getLogger(__name__)

_TRACKED = ("status", "priority", "assignee_id", "group_id", "board_id", "title", "archived_at")


@receiver(pre_save, sender=Task)
def capture_previous_task_state(sender, instance: Task, raw=False, **kwargs):
    if raw:
        return
    if instance._state.adding:
        instance._automation_previous = None
        return
    instance._automation_previous = (
        Task.objects.filter(pk=instance.pk).values(*_TRACKED).first()
    )


def _enqueue(event: dict) -> None:
    from blackbeans_api.automations.models import Automation
    from blackbeans_api.automations.tasks import process_automation_event

    try:
        if not Automation.objects.filter(is_enabled=True, trigger_type=event["trigger"]).exists():
            return
        process_automation_event.delay(event)
    except Exception:  # noqa: BLE001 - falha de fila nunca pode quebrar o salvamento da tarefa
        logger.exception("Nao foi possivel enfileirar evento de automacao %s", event.get("trigger"))


def _emit(instance, trigger: str, changes: dict, actor_id=None) -> None:
    event = {
        "trigger": trigger,
        "task_id": str(instance.pk if isinstance(instance, Task) else instance.task_id),
        "changes": changes,
        "actor_id": actor_id,
        "depth": engine.current_depth(),
        "chain": engine.current_chain(),
    }
    transaction.on_commit(lambda: _enqueue(event))


@receiver(post_save, sender=Task)
def task_saved(sender, instance: Task, created: bool, raw=False, **kwargs):
    if raw or getattr(instance, "_skip_automations", False):
        return
    if created:
        _emit(instance, "task.created", {})
        return
    prev = getattr(instance, "_automation_previous", None)
    if not prev:
        return
    if prev["status"] != instance.status:
        _emit(instance, "task.status_changed", {"from_status": prev["status"], "to_status": instance.status})
    if prev["assignee_id"] != instance.assignee_id:
        _emit(instance, "task.assignee_changed", {"assignee_id": instance.assignee_id})
    if prev["priority"] != instance.priority:
        _emit(instance, "task.priority_changed", {"from_priority": prev["priority"], "to_priority": instance.priority})
    if prev["group_id"] != instance.group_id:
        _emit(instance, "task.moved_to_group", {"group_id": str(instance.group_id)})
    if prev["board_id"] != instance.board_id:
        _emit(instance, "task.moved_to_board", {"board_id": str(instance.board_id)})
    if prev["title"] != instance.title:
        _emit(instance, "task.title_changed", {"from_title": prev["title"], "to_title": instance.title})
    if prev["archived_at"] is None and instance.archived_at is not None:
        _emit(instance, "task.archived", {})


@receiver(post_save, sender=TaskComment)
def comment_saved(sender, instance: TaskComment, created: bool, raw=False, **kwargs):
    if raw or not created:
        return
    _emit(instance, "task.comment_added", {}, actor_id=instance.author_id)
