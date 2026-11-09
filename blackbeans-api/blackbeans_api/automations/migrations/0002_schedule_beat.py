from django.db import migrations


def create_periodic_task(apps, schema_editor):
    try:
        CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    every_15 = CrontabSchedule.objects.get_or_create(
        minute="*/15",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Sao_Paulo",
    )[0]
    PeriodicTask.objects.update_or_create(
        name="automations-scheduled-triggers",
        defaults={
            "crontab": every_15,
            "task": "blackbeans_api.automations.tasks.run_scheduled_automations",
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="automations-scheduled-triggers").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("automations", "0001_initial"),
        ("django_celery_beat", "0006_auto_20180322_0932"),
    ]

    operations = [migrations.RunPython(create_periodic_task, remove_periodic_task)]
