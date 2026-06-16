from __future__ import annotations

from django.conf import settings
from django.core import signing
from django.template.loader import render_to_string

from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.notification_service import get_frontend_base_url
from blackbeans_api.governance.notification_service import get_user_display_name

UNSUBSCRIBE_SALT = "bb-notification-unsubscribe"
UNSUBSCRIBE_MAX_AGE = 60 * 60 * 24 * 365

EVENT_SUBJECT_PREFIX: dict[str, str] = {
    Notification.Type.ASSIGNED: "[Atribuicao a voce]",
    Notification.Type.MENTIONED: "[Mencao]",
    Notification.Type.COMMENTED: "[Novo comentario]",
    Notification.Type.COMPLETED: "[Tarefa concluida]",
    Notification.Type.OVERDUE: "[Atrasada]",
    Notification.Type.DUE_SOON: "[Prazo proximo]",
    Notification.Type.STATUS_CHANGED: "[Status alterado]",
    Notification.Type.PRIORITY_CHANGED: "[Prioridade alterada]",
    Notification.Type.UPDATED: "[Tarefa atualizada]",
}

EVENT_ACTION_TEXT: dict[str, str] = {
    Notification.Type.ASSIGNED: "{actor} atribuiu voce a",
    Notification.Type.MENTIONED: "{actor} mencionou voce em",
    Notification.Type.COMMENTED: "{actor} comentou em",
    Notification.Type.COMPLETED: "{actor} concluiu",
    Notification.Type.OVERDUE: "A tarefa esta atrasada:",
    Notification.Type.DUE_SOON: "A tarefa vence em breve:",
    Notification.Type.STATUS_CHANGED: "{actor} alterou o status de",
    Notification.Type.PRIORITY_CHANGED: "{actor} alterou a prioridade de",
    Notification.Type.UPDATED: "{actor} atualizou",
}


def build_unsubscribe_token(*, user_id: int, event_type: str) -> str:
    return signing.dumps({"user_id": user_id, "event_type": event_type}, salt=UNSUBSCRIBE_SALT)


def parse_unsubscribe_token(token: str) -> dict | None:
    try:
        return signing.loads(token, salt=UNSUBSCRIBE_SALT, max_age=UNSUBSCRIBE_MAX_AGE)
    except signing.BadSignature:
        return None


def build_unsubscribe_url(*, user_id: int, event_type: str) -> str:
    token = build_unsubscribe_token(user_id=user_id, event_type=event_type)
    base = get_frontend_base_url()
    return f"{base}/api/v1/notifications/unsubscribe?token={token}"


def build_preferences_url() -> str:
    return f"{get_frontend_base_url()}/#profile"


def notification_email_subject(notification: Notification) -> str:
    prefix = EVENT_SUBJECT_PREFIX.get(notification.type, "[Notificacao]")
    task_title = notification.metadata.get("task_title") or notification.title
    return f"{prefix} {task_title}"


def notification_action_text(notification: Notification) -> str:
    actor_name = notification.metadata.get("actor_name") or (
        get_user_display_name(notification.actor) if notification.actor else "Sistema"
    )
    template = EVENT_ACTION_TEXT.get(notification.type, "{actor} atualizou")
    return template.format(actor=actor_name)


def render_notification_email(notification: Notification) -> tuple[str, str, str]:
    context = {
        "app_name": getattr(settings, "NOTIFICATION_APP_NAME", "BlackBeans System"),
        "notification": notification,
        "action_text": notification_action_text(notification),
        "task_title": notification.metadata.get("task_title") or notification.title,
        "breadcrumb": notification.metadata.get("breadcrumb", ""),
        "deep_link": notification.metadata.get("deep_link") or build_preferences_url(),
        "message": notification.message,
        "preferences_url": build_preferences_url(),
        "unsubscribe_url": build_unsubscribe_url(
            user_id=notification.user_id,
            event_type=notification.type,
        ),
    }
    html_body = render_to_string("notifications/instant_email.html", context)
    text_body = render_to_string("notifications/instant_email.txt", context)
    subject = notification_email_subject(notification)
    return subject, text_body, html_body


def render_digest_email(*, user, notifications: list[Notification], digest_mode: str) -> tuple[str, str, str]:
    label = "Resumo diario" if digest_mode == "daily" else "Resumo semanal"
    context = {
        "app_name": getattr(settings, "NOTIFICATION_APP_NAME", "BlackBeans System"),
        "user_name": get_user_display_name(user),
        "digest_label": label,
        "notifications": notifications,
        "preferences_url": build_preferences_url(),
    }
    html_body = render_to_string("notifications/digest_email.html", context)
    text_body = render_to_string("notifications/digest_email.txt", context)
    subject = f"[{label}] {len(notifications)} notificacoes - BlackBeans System"
    return subject, text_body, html_body
