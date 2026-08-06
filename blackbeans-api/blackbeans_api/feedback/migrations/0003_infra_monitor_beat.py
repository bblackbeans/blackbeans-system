# Seed PeriodicTask: monitor de infraestrutura → Problemas (origem=system)

from django.db import migrations


def seed_infra_monitor(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=15,
        period="minutes",
    )
    PeriodicTask.objects.update_or_create(
        name="check-infrastructure-health-15m",
        defaults={
            "interval": schedule,
            "task": "blackbeans_api.feedback.tasks.check_infrastructure_health",
            "enabled": True,
        },
    )


def unseed_infra_monitor(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="check-infrastructure-health-15m").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("feedback", "0002_problemreport_fingerprint"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(seed_infra_monitor, unseed_infra_monitor),
    ]
