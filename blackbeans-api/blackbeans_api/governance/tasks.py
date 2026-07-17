from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.db.models import Q
from django.utils import timezone

from blackbeans_api.governance.email_rendering import render_digest_email
from blackbeans_api.governance.email_rendering import render_notification_email
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import NotificationDeliveryLog
from blackbeans_api.governance.models import NotificationDigestItem
from blackbeans_api.governance.models import NotificationPreference
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.notification_service import dispatch_deadline_notification
from blackbeans_api.governance.notification_service import dispatch_task_assigned
from blackbeans_api.governance.notification_service import dispatch_task_completed

User = get_user_model()


def _email_enabled() -> bool:
    return bool(getattr(settings, "NOTIFICATION_EMAIL_ENABLED", True))


def _recipient_email(user: User) -> str:
    return str(user.email or "").strip()


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_task_assigned_notification(*, task_id: str, assignee_id: int, actor_id: int, correlation_id: str) -> str:
    task = Task.objects.select_related("board__project__portfolio__workspace").get(pk=task_id)
    assignee = User.objects.get(pk=assignee_id)
    actor = User.objects.get(pk=actor_id)
    dispatch_task_assigned(task=task, assignee=assignee, actor=actor, correlation_id=correlation_id)
    return "ok"


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_task_completed_notifications(*, task_id: str, actor_id: int, correlation_id: str) -> str:
    task = Task.objects.select_related("board__project__portfolio__workspace").get(pk=task_id)
    actor = User.objects.get(pk=actor_id)
    dispatch_task_completed(task=task, actor=actor, correlation_id=correlation_id)
    return "ok"


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_deadline_notifications(*, correlation_id: str = "system") -> dict:
    now = timezone.now()
    soon_limit = now + timedelta(days=1)
    created = {"overdue": 0, "due_soon": 0}

    overdue_tasks = Task.objects.filter(end_date__lt=now).exclude(status=Task.Status.DONE)
    due_soon_tasks = Task.objects.filter(end_date__gte=now, end_date__lte=soon_limit).exclude(
        status=Task.Status.DONE,
    )

    for task in overdue_tasks.select_related("board__project__portfolio__workspace"):
        if not task.assignee_id:
            continue
        if Notification.objects.filter(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.OVERDUE,
            created_at__gte=now - timedelta(hours=6),
        ).exists():
            continue
        dispatch_deadline_notification(
            task=task,
            event_type=Notification.Type.OVERDUE,
            title="Tarefa atrasada",
            message=f"A tarefa '{task.title}' esta atrasada.",
            correlation_id=correlation_id,
        )
        created["overdue"] += 1

    for task in due_soon_tasks.select_related("board__project__portfolio__workspace"):
        if not task.assignee_id:
            continue
        if Notification.objects.filter(
            user_id=task.assignee_id,
            task=task,
            type=Notification.Type.DUE_SOON,
            created_at__gte=now - timedelta(hours=6),
        ).exists():
            continue
        dispatch_deadline_notification(
            task=task,
            event_type=Notification.Type.DUE_SOON,
            title="Prazo proximo",
            message=f"A tarefa '{task.title}' vence em breve.",
            correlation_id=correlation_id,
        )
        created["due_soon"] += 1

    return created


def queue_notification_email(notification_id: str) -> None:
    send_notification_email.delay(notification_id)


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_notification_email(notification_id: str) -> str:
    if not _email_enabled():
        return "disabled"

    notification = Notification.objects.select_related("user", "actor", "task").get(pk=notification_id)
    if notification.email_sent_at:
        return "already_sent"

    recipient = _recipient_email(notification.user)
    if not recipient:
        NotificationDeliveryLog.objects.create(
            notification=notification,
            user=notification.user,
            channel=Notification.Channel.EMAIL,
            status=NotificationDeliveryLog.Status.FAILED,
            error="Usuario sem e-mail cadastrado.",
        )
        return "no_email"

    subject, text_body, html_body = render_notification_email(notification)
    log = NotificationDeliveryLog.objects.create(
        notification=notification,
        user=notification.user,
        channel=Notification.Channel.EMAIL,
        status=NotificationDeliveryLog.Status.PENDING,
    )
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
        )
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)
        now = timezone.now()
        notification.email_sent_at = now
        notification.save(update_fields=["email_sent_at", "updated_at"])
        log.status = NotificationDeliveryLog.Status.SENT
        log.save(update_fields=["status"])
        return "sent"
    except Exception as exc:  # noqa: BLE001
        log.status = NotificationDeliveryLog.Status.FAILED
        log.error = str(exc)
        log.save(update_fields=["status", "error"])
        raise


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_notification_digest(user_id: str, digest_mode: str) -> str:
    if not _email_enabled():
        return "disabled"

    user = User.objects.get(pk=int(user_id))
    now = timezone.now()
    pending = NotificationDigestItem.objects.filter(
        user=user,
        digest_mode=digest_mode,
        sent_at__isnull=True,
        scheduled_for__lte=now,
    ).select_related("notification")
    if not pending.exists():
        return "empty"

    notifications = [item.notification for item in pending]
    recipient = _recipient_email(user)
    if not recipient:
        return "no_email"

    subject, text_body, html_body = render_digest_email(
        user=user,
        notifications=notifications,
        digest_mode=digest_mode,
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)

    sent_at = timezone.now()
    pending.update(sent_at=sent_at)
    Notification.objects.filter(pk__in=[n.pk for n in notifications]).update(digest_sent_at=sent_at)
    NotificationDeliveryLog.objects.create(
        user=user,
        channel=Notification.Channel.EMAIL,
        status=NotificationDeliveryLog.Status.SENT,
    )
    return f"sent:{len(notifications)}"


@shared_task
def send_daily_notification_digests() -> dict:
    user_ids = (
        NotificationDigestItem.objects.filter(
            digest_mode=NotificationPreference.EmailMode.DAILY,
            sent_at__isnull=True,
            scheduled_for__lte=timezone.now(),
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    count = 0
    for user_id in user_ids:
        send_notification_digest.delay(str(user_id), NotificationPreference.EmailMode.DAILY)
        count += 1
    return {"queued": count}


@shared_task
def send_weekly_notification_digests() -> dict:
    user_ids = (
        NotificationDigestItem.objects.filter(
            digest_mode=NotificationPreference.EmailMode.WEEKLY,
            sent_at__isnull=True,
            scheduled_for__lte=timezone.now(),
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    count = 0
    for user_id in user_ids:
        send_notification_digest.delay(str(user_id), NotificationPreference.EmailMode.WEEKLY)
        count += 1
    return {"queued": count}


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def run_overdue_tasks_weekly_agent(*, correlation_id: str = "system", triggered_by_id: int | None = None) -> dict:
    from blackbeans_api.governance.agent_service import execute_overdue_tasks_weekly_agent

    triggered_by = None
    if triggered_by_id is not None:
        triggered_by = User.objects.filter(pk=triggered_by_id).first()
    run = execute_overdue_tasks_weekly_agent(
        correlation_id=correlation_id,
        triggered_by=triggered_by,
    )
    return {
        "run_id": str(run.pk),
        "status": run.status,
        "summary": run.summary_text,
        "total_overdue": int((run.report_json or {}).get("total_overdue") or 0),
    }


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def run_blocked_stale_tasks_agent(*, correlation_id: str = "system", triggered_by_id: int | None = None) -> dict:
    from blackbeans_api.governance.agent_service import execute_blocked_stale_tasks_agent

    triggered_by = None
    if triggered_by_id is not None:
        triggered_by = User.objects.filter(pk=triggered_by_id).first()
    run = execute_blocked_stale_tasks_agent(
        correlation_id=correlation_id,
        triggered_by=triggered_by,
    )
    return {
        "run_id": str(run.pk),
        "status": run.status,
        "summary": run.summary_text,
        "total_flagged": int((run.report_json or {}).get("total_flagged") or 0),
    }
