from __future__ import annotations

import re
from datetime import datetime
from datetime import time
from datetime import timedelta
from typing import Iterable

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import NotificationDigestItem
from blackbeans_api.governance.models import NotificationPreference
from blackbeans_api.governance.models import NotificationSubscription
from blackbeans_api.governance.models import Task

User = get_user_model()

MENTION_PATTERN = re.compile(r"@([a-zA-Z0-9_.@-]+)")

DEFAULT_EMAIL_MODES: dict[str, str] = {
    Notification.Type.ASSIGNED: NotificationPreference.EmailMode.INSTANT,
    Notification.Type.MENTIONED: NotificationPreference.EmailMode.INSTANT,
    Notification.Type.COMMENTED: NotificationPreference.EmailMode.INSTANT,
    Notification.Type.OVERDUE: NotificationPreference.EmailMode.INSTANT,
    Notification.Type.DUE_SOON: NotificationPreference.EmailMode.INSTANT,
    Notification.Type.COMPLETED: NotificationPreference.EmailMode.DAILY,
    Notification.Type.STATUS_CHANGED: NotificationPreference.EmailMode.DAILY,
    Notification.Type.PRIORITY_CHANGED: NotificationPreference.EmailMode.DAILY,
    Notification.Type.UPDATED: NotificationPreference.EmailMode.DAILY,
}

DEFAULT_IN_APP: dict[str, bool] = {event: True for event in DEFAULT_EMAIL_MODES}


def get_frontend_base_url() -> str:
    return str(getattr(settings, "FRONTEND_BASE_URL", "http://localhost:13000")).rstrip("/")


def build_task_deep_link(task_id: str) -> str:
    return f"{get_frontend_base_url()}/#tasks?task={task_id}"


def build_task_context(task: Task) -> dict:
    board = task.board
    project = board.project
    workspace = project.portfolio.workspace
    return {
        "task_id": str(task.pk),
        "task_title": task.title,
        "board_id": str(board.pk),
        "board_name": board.name or "Quadro",
        "project_id": str(project.pk),
        "project_name": project.name or "Projeto",
        "workspace_id": str(workspace.pk),
        "workspace_name": workspace.name,
        "breadcrumb": f"{workspace.name} > {project.name or 'Projeto'} > {board.name or 'Quadro'}",
        "deep_link": build_task_deep_link(str(task.pk)),
    }


def get_user_display_name(user: User) -> str:
    name = str(getattr(user, "name", "") or "").strip()
    if name:
        return name
    return user.get_username() or user.email or f"Usuario {user.pk}"


def ensure_user_preferences(user: User) -> None:
    existing = set(
        NotificationPreference.objects.filter(user=user).values_list("event_type", flat=True),
    )
    to_create = []
    for event_type in Notification.Type.values:
        if event_type in existing:
            continue
        to_create.append(
            NotificationPreference(
                user=user,
                event_type=event_type,
                in_app_enabled=DEFAULT_IN_APP.get(event_type, True),
                email_mode=DEFAULT_EMAIL_MODES.get(event_type, NotificationPreference.EmailMode.DAILY),
            ),
        )
    if to_create:
        NotificationPreference.objects.bulk_create(to_create)


def get_preference(user: User, event_type: str) -> NotificationPreference:
    ensure_user_preferences(user)
    return NotificationPreference.objects.get(user=user, event_type=event_type)


def preferences_to_list(user: User) -> list[dict]:
    ensure_user_preferences(user)
    rows = NotificationPreference.objects.filter(user=user).order_by("event_type")
    return [
        {
            "event_type": row.event_type,
            "in_app_enabled": row.in_app_enabled,
            "email_mode": row.email_mode,
        }
        for row in rows
    ]


def update_preferences(user: User, items: list[dict]) -> list[dict]:
    ensure_user_preferences(user)
    valid_events = set(Notification.Type.values)
    valid_modes = set(NotificationPreference.EmailMode.values)
    for item in items:
        event_type = str(item.get("event_type", ""))
        if event_type not in valid_events:
            continue
        email_mode = str(item.get("email_mode", NotificationPreference.EmailMode.INSTANT))
        if email_mode not in valid_modes:
            continue
        NotificationPreference.objects.filter(user=user, event_type=event_type).update(
            in_app_enabled=bool(item.get("in_app_enabled", True)),
            email_mode=email_mode,
        )
    return preferences_to_list(user)


def _digest_scheduled_for(mode: str) -> datetime:
    digest_hour = int(getattr(settings, "NOTIFICATION_DIGEST_HOUR", 8))
    now = timezone.localtime()
    target = timezone.make_aware(
        datetime.combine(now.date(), time(hour=digest_hour, minute=0)),
        timezone.get_current_timezone(),
    )
    if mode == NotificationPreference.EmailMode.WEEKLY:
        days_until_monday = (7 - now.weekday()) % 7
        if days_until_monday == 0 and now.hour >= digest_hour:
            days_until_monday = 7
        target = target + timedelta(days=days_until_monday)
    elif target <= now:
        target = target + timedelta(days=1)
    return target


def _should_skip_duplicate(*, user_id: int, task_id: str | None, event_type: str, window_minutes: int = 5) -> bool:
    if not task_id:
        return False
    since = timezone.now() - timedelta(minutes=window_minutes)
    return Notification.objects.filter(
        user_id=user_id,
        task_id=task_id,
        type=event_type,
        created_at__gte=since,
    ).exists()


def auto_subscribe_task(user: User, task: Task) -> None:
    NotificationSubscription.objects.get_or_create(
        user=user,
        target_type=NotificationSubscription.TargetType.TASK,
        target_id=task.pk,
    )


def get_task_watchers(task: Task, *, exclude_user_ids: Iterable[int] | None = None) -> list[User]:
    exclude = set(exclude_user_ids or [])
    task_subs = NotificationSubscription.objects.filter(
        target_type=NotificationSubscription.TargetType.TASK,
        target_id=task.pk,
    ).values_list("user_id", flat=True)
    board_subs = NotificationSubscription.objects.filter(
        target_type=NotificationSubscription.TargetType.BOARD,
        target_id=task.board_id,
    ).values_list("user_id", flat=True)
    user_ids = set(task_subs) | set(board_subs)
    if task.assignee_id:
        user_ids.add(task.assignee_id)
    user_ids -= exclude
    if not user_ids:
        return []
    return list(User.objects.filter(pk__in=user_ids, is_active=True))


def parse_mentioned_users(content: str) -> list[User]:
    tokens = MENTION_PATTERN.findall(content or "")
    if not tokens:
        return []
    users: list[User] = []
    seen: set[int] = set()
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        query = Q(username__iexact=token) | Q(email__iexact=token)
        if "@" in token:
            query = Q(email__iexact=token)
        for user in User.objects.filter(query, is_active=True):
            if user.pk in seen:
                continue
            seen.add(user.pk)
            users.append(user)
    return users


def dispatch_notification(
    *,
    event_type: str,
    recipients: Iterable[User],
    actor: User | None,
    title: str,
    message: str,
    task: Task | None = None,
    metadata: dict | None = None,
    correlation_id: str = "",
    dedupe: bool = True,
) -> list[str]:
    from blackbeans_api.governance.tasks import queue_notification_email

    created_ids: list[str] = []
    base_metadata = dict(metadata or {})
    if correlation_id:
        base_metadata["correlation_id"] = correlation_id
    if actor:
        base_metadata.setdefault("actor_id", actor.pk)
        base_metadata.setdefault("actor_name", get_user_display_name(actor))
    if task:
        base_metadata.update(build_task_context(task))

    for recipient in recipients:
        if not recipient or not recipient.is_active:
            continue
        if actor and recipient.pk == actor.pk and event_type in {
            Notification.Type.COMMENTED,
            Notification.Type.STATUS_CHANGED,
            Notification.Type.PRIORITY_CHANGED,
            Notification.Type.UPDATED,
        }:
            continue
        if dedupe and task and _should_skip_duplicate(
            user_id=recipient.pk,
            task_id=str(task.pk),
            event_type=event_type,
        ):
            continue

        pref = get_preference(recipient, event_type)
        notification = None
        if pref.in_app_enabled:
            notification = Notification.objects.create(
                user=recipient,
                task=task,
                actor=actor,
                type=event_type,
                title=title,
                message=message,
                channel=Notification.Channel.IN_APP,
                metadata=base_metadata,
            )
            created_ids.append(str(notification.pk))

        if pref.email_mode == NotificationPreference.EmailMode.OFF:
            continue
        if not notification:
            notification = Notification.objects.create(
                user=recipient,
                task=task,
                actor=actor,
                type=event_type,
                title=title,
                message=message,
                channel=Notification.Channel.EMAIL,
                metadata=base_metadata,
            )
            created_ids.append(str(notification.pk))

        if pref.email_mode == NotificationPreference.EmailMode.INSTANT:
            queue_notification_email(str(notification.pk))
        elif pref.email_mode in {
            NotificationPreference.EmailMode.DAILY,
            NotificationPreference.EmailMode.WEEKLY,
        }:
            scheduled_for = _digest_scheduled_for(pref.email_mode)
            NotificationDigestItem.objects.create(
                notification=notification,
                user=recipient,
                digest_mode=pref.email_mode,
                scheduled_for=scheduled_for,
            )

    return created_ids


def dispatch_task_assigned(*, task: Task, assignee: User, actor: User, correlation_id: str) -> None:
    auto_subscribe_task(assignee, task)
    dispatch_notification(
        event_type=Notification.Type.ASSIGNED,
        recipients=[assignee],
        actor=actor,
        title="Nova tarefa designada",
        message=f"Voce foi designado para a tarefa '{task.title}'.",
        task=task,
        correlation_id=correlation_id,
    )


def dispatch_task_completed(*, task: Task, actor: User, correlation_id: str) -> None:
    recipients = User.objects.filter(
        Q(pk=task.assignee_id) | Q(is_superuser=True),
        is_active=True,
    ).distinct()
    dispatch_notification(
        event_type=Notification.Type.COMPLETED,
        recipients=recipients,
        actor=actor,
        title="Tarefa concluida",
        message=f"A tarefa '{task.title}' foi concluida.",
        task=task,
        correlation_id=correlation_id,
        dedupe=False,
    )


def dispatch_task_status_changed(
    *,
    task: Task,
    actor: User,
    old_status: str,
    new_status: str,
    correlation_id: str,
) -> None:
    if new_status == Task.Status.DONE:
        dispatch_task_completed(task=task, actor=actor, correlation_id=correlation_id)
        return
    recipients = get_task_watchers(task, exclude_user_ids=[actor.pk])
    dispatch_notification(
        event_type=Notification.Type.STATUS_CHANGED,
        recipients=recipients,
        actor=actor,
        title="Status da tarefa alterado",
        message=f"Status de '{task.title}' mudou de {old_status} para {new_status}.",
        task=task,
        metadata={"old_status": old_status, "new_status": new_status},
        correlation_id=correlation_id,
    )


def dispatch_task_priority_changed(
    *,
    task: Task,
    actor: User,
    old_priority: str,
    new_priority: str,
    correlation_id: str,
) -> None:
    recipients = get_task_watchers(task, exclude_user_ids=[actor.pk])
    dispatch_notification(
        event_type=Notification.Type.PRIORITY_CHANGED,
        recipients=recipients,
        actor=actor,
        title="Prioridade da tarefa alterada",
        message=f"Prioridade de '{task.title}' mudou de {old_priority} para {new_priority}.",
        task=task,
        metadata={"old_priority": old_priority, "new_priority": new_priority},
        correlation_id=correlation_id,
    )


def dispatch_task_updated(*, task: Task, actor: User, fields: list[str], correlation_id: str) -> None:
    recipients = get_task_watchers(task, exclude_user_ids=[actor.pk])
    dispatch_notification(
        event_type=Notification.Type.UPDATED,
        recipients=recipients,
        actor=actor,
        title="Tarefa atualizada",
        message=f"A tarefa '{task.title}' foi atualizada ({', '.join(fields)}).",
        task=task,
        metadata={"fields": fields},
        correlation_id=correlation_id,
    )


def dispatch_task_comment(
    *,
    task: Task,
    actor: User,
    content: str,
    correlation_id: str,
) -> None:
    auto_subscribe_task(actor, task)
    mentioned = parse_mentioned_users(content)
    mention_ids = {user.pk for user in mentioned}
    watchers = get_task_watchers(task, exclude_user_ids=[actor.pk, *mention_ids])

    if mentioned:
        dispatch_notification(
            event_type=Notification.Type.MENTIONED,
            recipients=mentioned,
            actor=actor,
            title="Voce foi mencionado",
            message=f"{get_user_display_name(actor)} mencionou voce em '{task.title}'.",
            task=task,
            metadata={"comment_excerpt": content[:280]},
            correlation_id=correlation_id,
            dedupe=False,
        )

    dispatch_notification(
        event_type=Notification.Type.COMMENTED,
        recipients=watchers,
        actor=actor,
        title="Novo comentario na tarefa",
        message=f"{get_user_display_name(actor)} comentou em '{task.title}'.",
        task=task,
        metadata={"comment_excerpt": content[:280]},
        correlation_id=correlation_id,
        dedupe=False,
    )


def dispatch_deadline_notification(
    *,
    task: Task,
    event_type: str,
    title: str,
    message: str,
    correlation_id: str,
) -> None:
    if not task.assignee_id:
        return
    assignee = User.objects.get(pk=task.assignee_id)
    dispatch_notification(
        event_type=event_type,
        recipients=[assignee],
        actor=None,
        title=title,
        message=message,
        task=task,
        correlation_id=correlation_id,
        dedupe=True,
    )
