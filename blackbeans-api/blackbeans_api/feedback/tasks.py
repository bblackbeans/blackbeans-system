from __future__ import annotations

from celery import shared_task

from blackbeans_api.feedback.infra_monitor import run_infrastructure_health_check


@shared_task(name="blackbeans_api.feedback.tasks.check_infrastructure_health")
def check_infrastructure_health() -> dict:
    """Monitor periodico: DB cheio, disco, conexoes, latencia → Problemas (origem=system)."""
    return run_infrastructure_health_check()
