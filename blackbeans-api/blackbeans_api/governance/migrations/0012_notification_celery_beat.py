from django.db import migrations


def create_periodic_tasks(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return

    hourly, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    daily, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    weekly, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="1",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )

    PeriodicTask.objects.update_or_create(
        name="notification-deadline-scan-hourly",
        defaults={
            "crontab": hourly,
            "task": "blackbeans_api.governance.tasks.dispatch_deadline_notifications",
            "kwargs": '{"correlation_id": "celery-beat"}',
            "enabled": True,
        },
    )
    PeriodicTask.objects.update_or_create(
        name="notification-digest-daily",
        defaults={
            "crontab": daily,
            "task": "blackbeans_api.governance.tasks.send_daily_notification_digests",
            "enabled": True,
        },
    )
    PeriodicTask.objects.update_or_create(
        name="notification-digest-weekly",
        defaults={
            "crontab": weekly,
            "task": "blackbeans_api.governance.tasks.send_weekly_notification_digests",
            "enabled": True,
        },
    )


def remove_periodic_tasks(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(
        name__in=[
            "notification-deadline-scan-hourly",
            "notification-digest-daily",
            "notification-digest-weekly",
        ],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0011_notification_email_system"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_tasks, remove_periodic_tasks),
    ]
