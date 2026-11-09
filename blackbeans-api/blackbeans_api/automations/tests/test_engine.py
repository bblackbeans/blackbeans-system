from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from blackbeans_api.automations import engine
from blackbeans_api.automations.catalog import validate_definition
from blackbeans_api.automations.models import Automation
from blackbeans_api.automations.models import AutomationRun
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.tests.factories import BoardFactory
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def setup():
    owner = UserFactory(is_staff=True)
    board = BoardFactory()
    group = BoardGroup.objects.create(board=board, name="Backlog", position=1)
    workspace = board.project.portfolio.workspace
    return owner, board, group, workspace


def make_task(board, group, **kw) -> Task:
    return Task.objects.create(board=board, group=group, title=kw.pop("title", "Tarefa"), **kw)


def make_automation(workspace, owner, trigger, actions, **kw) -> Automation:
    return Automation.objects.create(
        workspace=workspace,
        name=kw.pop("name", "auto"),
        trigger_type=trigger,
        trigger_config=kw.pop("trigger_config", {}),
        conditions=kw.pop("conditions", []),
        actions=actions,
        created_by=owner,
        **kw,
    )


def test_status_change_sets_priority(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.status_changed",
        [{"type": "set_priority", "config": {"priority": "critical"}}],
        trigger_config={"to_status": "blocked"},
    )
    task = make_task(board, group)
    task.status = "blocked"
    task.save(update_fields=["status"])
    task.refresh_from_db()
    assert task.priority == "critical"
    run = AutomationRun.objects.get()
    assert run.status == "success"


def test_trigger_config_filters_non_matching_status(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.status_changed",
        [{"type": "set_priority", "config": {"priority": "critical"}}],
        trigger_config={"to_status": "blocked"},
    )
    task = make_task(board, group)
    task.status = "in_progress"
    task.save(update_fields=["status"])
    assert not AutomationRun.objects.exists()


def test_conditions_gate_execution(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.created",
        [{"type": "set_priority", "config": {"priority": "high"}}],
        conditions=[{"field": "title", "op": "contains", "value": "urgente"}],
    )
    normal = make_task(board, group, title="Rotina")
    urgent = make_task(board, group, title="Cliente URGENTE")
    normal.refresh_from_db()
    urgent.refresh_from_db()
    assert normal.priority == "medium"
    assert urgent.priority == "high"


def test_board_scoped_automation_ignores_other_boards(setup):
    owner, board, group, ws = setup
    other_board = BoardFactory(project=board.project)
    other_group = BoardGroup.objects.create(board=other_board, name="G", position=1)
    make_automation(
        ws, owner, "task.created",
        [{"type": "set_priority", "config": {"priority": "high"}}],
        board=board,
    )
    t = make_task(other_board, other_group)
    t.refresh_from_db()
    assert t.priority == "medium"


def test_loop_between_automations_is_stopped(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.priority_changed", [{"type": "set_priority", "config": {"priority": "low"}}], name="a",
                    trigger_config={"to_priority": "high"})
    make_automation(ws, owner, "task.priority_changed", [{"type": "set_priority", "config": {"priority": "high"}}], name="b",
                    trigger_config={"to_priority": "low"})
    task = make_task(board, group)
    task.priority = "high"
    task.save(update_fields=["priority"])
    # termina (nao entra em laco infinito) e limita o numero de execucoes
    assert AutomationRun.objects.count() <= engine.MAX_DEPTH + 1


def test_failed_action_is_logged_and_next_actions_continue(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.created",
        [
            {"type": "set_status", "config": {"status": "nao_existe"}},
            {"type": "set_priority", "config": {"priority": "high"}},
        ],
    )
    task = make_task(board, group)
    task.refresh_from_db()
    run = AutomationRun.objects.get()
    assert run.status == "failed"
    assert [l["ok"] for l in run.actions_log] == [False, True]
    assert task.priority == "high"


def test_delete_task_action_removes_task_and_keeps_run(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.created",
        [{"type": "delete_task", "config": {}}, {"type": "set_priority", "config": {"priority": "high"}}],
    )
    task = make_task(board, group)
    assert not Task.objects.filter(pk=task.pk).exists()
    run = AutomationRun.objects.get()
    assert run.status == "success"
    assert run.task is None
    assert len(run.actions_log) == 1


def test_notify_and_comment_and_subtask(setup):
    owner, board, group, ws = setup
    assignee = UserFactory()
    make_automation(
        ws, owner, "task.assignee_changed",
        [
            {"type": "notify", "config": {"recipients": "assignee", "message": "Voce recebeu {{task.title}}"}},
            {"type": "add_comment", "config": {"content": "Atribuida a {{task.assignee}}"}},
            {"type": "create_subtask", "config": {"title": "Sub de {{task.title}}"}},
        ],
    )
    task = make_task(board, group, title="Landing")
    task.assignee = assignee
    task.save(update_fields=["assignee"])
    assert Notification.objects.filter(user=assignee, message="Voce recebeu Landing").exists()
    assert task.comments.count() == 1
    assert Task.objects.filter(parent=task, title="Sub de Landing").exists()


def test_dry_run_changes_nothing(setup):
    owner, board, group, ws = setup
    auto = make_automation(ws, owner, "task.button", [{"type": "set_priority", "config": {"priority": "critical"}}])
    task = make_task(board, group)
    run = engine.run_automation(auto, task, dry_run=True)
    task.refresh_from_db()
    assert task.priority == "medium"
    assert run.is_dry_run
    auto.refresh_from_db()
    assert auto.run_count == 0


def test_overdue_scheduled_runs_once(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.overdue", [{"type": "set_priority", "config": {"priority": "critical"}}])
    past = make_task(board, group, end_date=timezone.now() - timedelta(days=1))
    make_task(board, group, title="futura", end_date=timezone.now() + timedelta(days=3))
    assert engine.run_scheduled_automations()["ran"] == 1
    assert engine.run_scheduled_automations()["ran"] == 0
    past.refresh_from_db()
    assert past.priority == "critical"


def test_due_soon_window(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.due_soon", [{"type": "set_priority", "config": {"priority": "high"}}],
                    trigger_config={"days_before": 2})
    make_task(board, group, title="perto", end_date=timezone.now() + timedelta(days=1))
    make_task(board, group, title="longe", end_date=timezone.now() + timedelta(days=10))
    assert engine.run_scheduled_automations()["ran"] == 1


def test_recurring_schedule_does_not_backfill_then_fires(setup):
    owner, board, group, ws = setup
    auto = make_automation(
        ws, owner, "schedule.recurring", [{"type": "set_priority", "config": {"priority": "high"}}],
        trigger_config={"frequency": "daily", "hour": 9},
    )
    make_task(board, group)
    now = timezone.now()
    assert engine.run_scheduled_automations(now=now)["ran"] == 0  # primeiro tick so marca o inicio
    auto.refresh_from_db()
    assert auto.last_scheduled_at is not None
    assert engine.run_scheduled_automations(now=now + timedelta(days=1, hours=1))["ran"] == 1


def test_validate_definition_rejects_garbage():
    errs = validate_definition(trigger_type="x", trigger_config=[], conditions=[{"field": "a"}], actions=[])
    assert {"trigger_type", "trigger_config", "conditions", "actions"} <= set(errs)


def test_api_crud_and_permissions(setup):
    owner, board, group, ws = setup
    client = APIClient()
    payload = {
        "workspace_id": str(ws.pk),
        "name": "Minha receita",
        "trigger_type": "task.created",
        "actions": [{"type": "set_priority", "config": {"priority": "high"}}],
    }
    client.force_authenticate(UserFactory())  # colaborador sem area liberada
    assert client.post("/api/v1/automations", payload, format="json").status_code == 403
    client.force_authenticate(owner)
    resp = client.post("/api/v1/automations", payload, format="json")
    assert resp.status_code == 201, resp.content
    aid = resp.json()["data"]["automation"]["id"]
    assert client.get(f"/api/v1/automations?workspace_id={ws.pk}").json()["data"]["automations"][0]["id"] == aid
    assert client.patch(f"/api/v1/automations/{aid}", {"is_enabled": False}, format="json").status_code == 200
    bad = client.patch(f"/api/v1/automations/{aid}", {"actions": []}, format="json")
    assert bad.status_code == 400
    task = make_task(board, group)
    run = client.post(f"/api/v1/automations/{aid}/run", {"task_id": str(task.pk), "dry_run": True}, format="json")
    assert run.status_code == 200 and run.json()["data"]["run"]["is_dry_run"]
    assert client.get("/api/v1/automations/catalog").json()["data"]["recipes"]
    assert client.delete(f"/api/v1/automations/{aid}").status_code == 200


def test_push_date_and_set_effort(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.status_changed",
        [
            {"type": "push_date", "config": {"amount": 1, "unit": "months"}},
            {"type": "set_effort", "config": {"points": 5}},
        ],
        trigger_config={"to_status": "blocked"},
    )
    base = timezone.now().replace(day=31, month=1, year=2027)
    task = make_task(board, group, end_date=base)
    task.status = "blocked"
    task.save(update_fields=["status"])
    task.refresh_from_db()
    assert (task.end_date.year, task.end_date.month, task.end_date.day) == (2027, 2, 28)
    assert float(task.effort_points) == 5


def test_push_date_without_date_fails_but_next_runs(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.created",
        [{"type": "push_date", "config": {"amount": 2, "unit": "days"}}, {"type": "set_effort", "config": {"points": 3}}],
    )
    task = make_task(board, group)
    task.refresh_from_db()
    run = AutomationRun.objects.get()
    assert [l["ok"] for l in run.actions_log] == [False, True]
    assert float(task.effort_points) == 3


def test_move_duplicate_and_create_across_boards(setup):
    owner, board, group, ws = setup
    other = BoardFactory(project=board.project)
    other_group = BoardGroup.objects.create(board=other, name="Destino", position=1)
    make_automation(
        ws, owner, "task.button",
        [
            {"type": "duplicate_task", "config": {"group_id": str(other_group.pk)}},
            {"type": "create_task", "config": {"group_id": str(other_group.pk), "title": "Seguir: {{task.title}}"}},
            {"type": "move_to_board", "config": {"group_id": str(other_group.pk)}},
        ],
    )
    task = make_task(board, group, title="Origem")
    sub = Task.objects.create(board=board, group=group, parent=task, title="Filha")
    automation = Automation.objects.get()
    run = engine.run_automation(automation, task)
    assert run.status == "success", run.actions_log
    task.refresh_from_db()
    sub.refresh_from_db()
    assert task.board_id == other.pk and task.group_id == other_group.pk
    assert sub.board_id == other.pk
    titles = set(Task.objects.filter(board=other).values_list("title", flat=True))
    assert {"Origem (copia)", "Seguir: Origem", "Origem", "Filha"} <= titles


def test_cross_workspace_target_group_is_refused(setup):
    owner, board, group, ws = setup
    foreign = BoardGroup.objects.create(board=BoardFactory(), name="Alheio", position=1)
    make_automation(ws, owner, "task.button", [{"type": "move_to_board", "config": {"group_id": str(foreign.pk)}}])
    task = make_task(board, group)
    run = engine.run_automation(Automation.objects.get(), task)
    assert run.status == "failed"
    task.refresh_from_db()
    assert task.board_id == board.pk


def test_title_changed_and_archived_triggers(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.title_changed", [{"type": "set_priority", "config": {"priority": "high"}}], name="a")
    make_automation(ws, owner, "task.archived", [{"type": "set_effort", "config": {"points": 9}}], name="b")
    task = make_task(board, group, title="Antes")
    task.title = "Depois"
    task.save(update_fields=["title"])
    task.archived_at = timezone.now()
    task.save(update_fields=["archived_at"])
    task.refresh_from_db()
    assert task.priority == "high"
    assert float(task.effort_points) == 9
