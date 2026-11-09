from __future__ import annotations

from celery import shared_task

from blackbeans_api.automations import engine


@shared_task
def process_automation_event(event: dict) -> int:
    return engine.process_event(event)


@shared_task
def run_scheduled_automations() -> dict:
    return engine.run_scheduled_automations()
