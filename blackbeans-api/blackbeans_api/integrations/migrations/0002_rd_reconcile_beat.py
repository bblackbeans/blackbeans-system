from django.db import migrations


def seed_rd_reconcile(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    daily, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )
    PeriodicTask.objects.update_or_create(
        name="rdstation-reconcile-mapped-daily",
        defaults={
            "crontab": daily,
            "task": "blackbeans_api.integrations.tasks.reconcile_rd_mappings",
            "enabled": True,
        },
    )


def unseed_rd_reconcile(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="rdstation-reconcile-mapped-daily").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0001_initial"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_rd_reconcile, unseed_rd_reconcile),
    ]
