from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.users.models import User


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_task_assigned_notification(*, task_id: str, assignee_id: int, actor_id: int, correlation_id: str) -> str:
    task = Task.objects.get(pk=task_id)
    assignee = User.objects.get(pk=assignee_id)
    Notification.objects.create(
        user=assignee,
        task=task,
        type=Notification.Type.ASSIGNED,
        title="Nova tarefa designada",
        message=f"Voce foi designado para a tarefa '{task.title}'.",
        metadata={"actor_id": actor_id, "correlation_id": correlation_id},
    )
    return "ok"


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_task_completed_notifications(*, task_id: str, actor_id: int, correlation_id: str) -> str:
    task = Task.objects.select_related("assignee").get(pk=task_id)
    recipients = User.objects.filter(
        Q(pk=task.assignee_id) | Q(is_superuser=True),
        is_active=True,
    ).distinct()
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            task=task,
            type=Notification.Type.COMPLETED,
            title="Tarefa concluida",
            message=f"A tarefa '{task.title}' foi concluida.",
            metadata={"actor_id": actor_id, "correlation_id": correlation_id},
        )
    return "ok"


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_deadline_notifications(*, correlation_id: str = "system") -> dict:
    now = timezone.now()
    soon_limit = now + timedelta(days=1)
    created = {"overdue": 0, "due_soon": 0}

    overdue_tasks = Task.objects.filter(
        end_date__lt=now,
    ).exclude(status=Task.Status.DONE)
    due_soon_tasks = Task.objects.filter(
        end_date__gte=now,
        end_date__lte=soon_limit,
    ).exclude(status=Task.Status.DONE)

    for task in overdue_tasks:
        if not task.assignee_id:
            continue
        if Notification.objects.filter(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.OVERDUE,
            created_at__gte=now - timedelta(hours=6),
        ).exists():
            continue
        Notification.objects.create(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.OVERDUE,
            title="Tarefa atrasada",
            message=f"A tarefa '{task.title}' esta atrasada.",
            metadata={"severity": "high", "correlation_id": correlation_id},
        )
        created["overdue"] += 1

    for task in due_soon_tasks:
        if not task.assignee_id:
            continue
        if Notification.objects.filter(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.DUE_SOON,
            created_at__gte=now - timedelta(hours=6),
        ).exists():
            continue
        Notification.objects.create(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.DUE_SOON,
            title="Prazo proximo",
            message=f"A tarefa '{task.title}' vence em breve.",
            metadata={"severity": "medium", "correlation_id": correlation_id},
        )
        created["due_soon"] += 1

    return created
