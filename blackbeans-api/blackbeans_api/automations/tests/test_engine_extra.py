"""Bateria extra: bordas do motor, validacao, API e isolamento entre areas de trabalho."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from blackbeans_api.automations import engine
from blackbeans_api.automations.catalog import ACTIONS
from blackbeans_api.automations.catalog import MAX_ACTIONS
from blackbeans_api.automations.catalog import TRIGGERS
from blackbeans_api.automations.catalog import validate_definition
from blackbeans_api.automations.models import Automation
from blackbeans_api.automations.models import AutomationRun
from blackbeans_api.automations.tests.test_engine import make_automation
from blackbeans_api.automations.tests.test_engine import make_task
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import TaskStatusDefinition
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


@pytest.fixture
def staff_client(setup):
    client = APIClient()
    client.force_authenticate(setup[0])
    return client


def _run(automation, task, **kw):
    return engine.run_automation(automation, task, **kw)


# --- Condicoes ------------------------------------------------------------------

@pytest.mark.parametrize(
    ("task_kwargs", "cond", "expected"),
    [
        ({"title": "Urgente: pagar"}, {"field": "title", "op": "contains", "value": "urgente"}, True),
        ({"title": "Rotina"}, {"field": "title", "op": "contains", "value": "urgente"}, False),
        ({"title": "x"}, {"field": "title", "op": "contains", "value": None}, False),
        ({"effort_points": Decimal("5")}, {"field": "effort_points", "op": "gt", "value": 3}, True),
        ({"effort_points": Decimal("5")}, {"field": "effort_points", "op": "lt", "value": 3}, False),
        ({"effort_points": Decimal("5")}, {"field": "effort_points", "op": "gt", "value": "abc"}, False),
        ({"status": "blocked"}, {"field": "status", "op": "in", "value": ["blocked", "todo"]}, True),
        ({"status": "done"}, {"field": "status", "op": "not_in", "value": ["blocked", "todo"]}, True),
        ({"status": "done"}, {"field": "status", "op": "eq", "value": "done"}, True),
        ({"status": "done"}, {"field": "status", "op": "neq", "value": "done"}, False),
        ({}, {"field": "assignee_id", "op": "is_empty"}, True),
        ({}, {"field": "assignee_id", "op": "not_empty"}, False),
        ({}, {"field": "end_date", "op": "gt", "value": "2020-01-01T00:00:00Z"}, False),
        ({}, {"field": "parent_id", "op": "is_empty"}, True),
    ],
)
def test_condition_operators(task_kwargs, cond, expected):
    task = Task(title=task_kwargs.pop("title", "T"), **task_kwargs)
    assert engine.evaluate_condition(task, cond) is expected


def test_date_condition_compares_with_iso_value():
    task = Task(title="T", end_date=datetime(2026, 5, 1, tzinfo=dt_timezone.utc))
    assert engine.evaluate_condition(task, {"field": "end_date", "op": "gt", "value": "2026-01-01T00:00:00Z"})
    assert not engine.evaluate_condition(task, {"field": "end_date", "op": "lt", "value": "2026-01-01T00:00:00Z"})


def test_unknown_operator_is_false():
    assert engine.evaluate_condition(Task(title="T"), {"field": "title", "op": "???", "value": "T"}) is False


# --- Templates ------------------------------------------------------------------

def test_render_template_unknown_variable_becomes_empty(setup):
    owner, board, group, ws = setup
    automation = make_automation(ws, owner, "task.created", [{"type": "archive_task", "config": {}}], name="Minha")
    task = make_task(board, group, title="Olá")
    out = engine.render_template("{{task.title}}|{{ task.nope }}|{{automation.name}}|{{task.priority}}", task=task, automation=automation)
    assert out == "Olá||Minha|medium"


def test_render_template_includes_assignee_name(setup):
    owner, board, group, ws = setup
    person = UserFactory(name="Maria Silva")
    automation = make_automation(ws, owner, "task.created", [{"type": "archive_task", "config": {}}])
    task = make_task(board, group, assignee=person)
    assert engine.render_template("{{task.assignee}}", task=task, automation=automation) == "Maria Silva"


# --- Validacao ------------------------------------------------------------------

def _valid(**over):
    base = {
        "trigger_type": "task.created",
        "trigger_config": {},
        "conditions": [],
        "actions": [{"type": "archive_task", "config": {}}],
    }
    base.update(over)
    return validate_definition(**base)


def test_validate_accepts_minimal_definition():
    assert _valid() == {}


@pytest.mark.parametrize(
    ("over", "field"),
    [
        ({"trigger_type": "nope"}, "trigger_type"),
        ({"trigger_type": None}, "trigger_type"),
        ({"trigger_config": []}, "trigger_config"),
        ({"trigger_type": "task.due_soon", "trigger_config": {}}, "trigger_config"),
        ({"trigger_type": "task.due_soon", "trigger_config": {"days_before": 91}}, "trigger_config"),
        ({"trigger_type": "task.due_soon", "trigger_config": {"days_before": True}}, "trigger_config"),
        ({"trigger_type": "schedule.recurring", "trigger_config": {"frequency": "weekly", "hour": 9}}, "trigger_config"),
        ({"trigger_type": "schedule.recurring", "trigger_config": {"frequency": "monthly", "hour": 9, "day_of_month": 31}}, "trigger_config"),
        ({"trigger_type": "schedule.recurring", "trigger_config": {"frequency": "daily", "hour": 24}}, "trigger_config"),
        ({"conditions": "x"}, "conditions"),
        ({"conditions": [{"field": "senha", "op": "eq"}]}, "conditions"),
        ({"conditions": [{"field": "title", "op": "regex"}]}, "conditions"),
        ({"conditions": [{"field": "title", "op": "eq"}] * 11}, "conditions"),
        ({"actions": []}, "actions"),
        ({"actions": None}, "actions"),
        ({"actions": [{"type": "rm_rf", "config": {}}]}, "actions"),
        ({"actions": [{"type": "set_status", "config": {}}]}, "actions"),
        ({"actions": [{"type": "set_status", "config": "x"}]}, "actions"),
        ({"actions": [{"type": "archive_task", "config": {}}] * (MAX_ACTIONS + 1)}, "actions"),
        ({"actions": ["archive_task"]}, "actions"),
        ({"actions": [{"type": "push_date", "config": {}}]}, "actions"),
        ({"actions": [{"type": "move_to_board", "config": {}}]}, "actions"),
        ({"actions": [{"type": "create_task", "config": {"group_id": "x"}}]}, "actions"),
    ],
)
def test_validate_rejects(over, field):
    assert field in _valid(**over)


def test_every_catalog_action_and_trigger_has_a_handler_or_dispatch():
    assert set(ACTIONS) == set(engine.ACTION_HANDLERS)
    assert {"task.created", "task.button", "schedule.recurring"} <= set(TRIGGERS)


# --- Disparo --------------------------------------------------------------------

def test_disabled_automation_does_not_fire(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.created", [{"type": "set_priority", "config": {"priority": "high"}}], is_enabled=False)
    task = make_task(board, group)
    task.refresh_from_db()
    assert task.priority == "medium"
    assert AutomationRun.objects.count() == 0


def test_status_from_filter(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.status_changed",
        [{"type": "set_priority", "config": {"priority": "low"}}],
        trigger_config={"from_status": "in_progress", "to_status": "done"},
    )
    a = make_task(board, group, status="todo")
    a.status = "done"
    a.save(update_fields=["status"])
    b = make_task(board, group, status="in_progress")
    b.status = "done"
    b.save(update_fields=["status"])
    a.refresh_from_db()
    b.refresh_from_db()
    assert a.priority == "medium"
    assert b.priority == "low"


def test_assignee_changed_specific_user(setup):
    owner, board, group, ws = setup
    wanted, other = UserFactory(), UserFactory()
    make_automation(
        ws, owner, "task.assignee_changed",
        [{"type": "set_priority", "config": {"priority": "high"}}],
        trigger_config={"assignee_id": wanted.pk},
    )
    t1, t2 = make_task(board, group), make_task(board, group)
    t1.assignee = other
    t1.save(update_fields=["assignee"])
    t2.assignee = wanted
    t2.save(update_fields=["assignee"])
    t1.refresh_from_db()
    t2.refresh_from_db()
    assert (t1.priority, t2.priority) == ("medium", "high")


def test_saving_other_field_does_not_fire_title_changed(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.title_changed", [{"type": "set_effort", "config": {"points": 7}}])
    task = make_task(board, group, title="Mesmo")
    task.priority = "high"
    task.save(update_fields=["priority"])
    task.refresh_from_db()
    assert float(task.effort_points) == 1
    assert AutomationRun.objects.count() == 0


def test_manual_board_change_fires_moved_to_board(setup):
    owner, board, group, ws = setup
    other = BoardFactory(project=board.project)
    other_group = BoardGroup.objects.create(board=other, name="G", position=1)
    make_automation(ws, owner, "task.moved_to_board", [{"type": "set_effort", "config": {"points": 4}}])
    task = make_task(board, group)
    task.board, task.group = other, other_group
    task.save(update_fields=["board", "group"])
    task.refresh_from_db()
    assert float(task.effort_points) == 4


def test_archived_task_ignores_other_triggers(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.comment_added", [{"type": "set_effort", "config": {"points": 2}}])
    task = make_task(board, group, archived_at=timezone.now())
    assert engine.process_event({"trigger": "task.comment_added", "task_id": str(task.pk), "changes": {}}) == 0


def test_event_beyond_max_depth_is_dropped(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 2}}])
    task = make_task(board, group)
    assert engine.process_event({"trigger": "task.button", "task_id": str(task.pk), "depth": engine.MAX_DEPTH}) == 0


def test_event_for_missing_task_is_ignored():
    assert engine.process_event({"trigger": "task.created", "task_id": "00000000-0000-0000-0000-000000000000"}) == 0


def test_workspace_scoped_automation_ignores_tasks_of_other_workspace(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.created", [{"type": "set_priority", "config": {"priority": "critical"}}])
    foreign_board = BoardFactory()  # outra area de trabalho
    foreign_group = BoardGroup.objects.create(board=foreign_board, name="X", position=1)
    assert foreign_board.project.portfolio.workspace_id != ws.pk
    task = make_task(foreign_board, foreign_group)
    task.refresh_from_db()
    assert task.priority == "medium"


# --- Acoes: bordas --------------------------------------------------------------

def test_set_assignee_inactive_user_fails_and_empty_clears(setup):
    owner, board, group, ws = setup
    inactive = UserFactory(is_active=False)
    person = UserFactory()
    task = make_task(board, group, assignee=person)
    bad = make_automation(ws, owner, "task.button", [{"type": "set_assignee", "config": {"assignee_id": inactive.pk}}], name="bad")
    assert _run(bad, task).status == "failed"
    clear = make_automation(ws, owner, "task.button", [{"type": "set_assignee", "config": {}}], name="clear")
    assert _run(clear, task).status == "success"
    task.refresh_from_db()
    assert task.assignee_id is None


def test_notify_creates_notification_and_handles_no_recipient(setup):
    owner, board, group, ws = setup
    person = UserFactory()
    task = make_task(board, group, assignee=person, title="Alvo")
    ok = make_automation(
        ws, owner, "task.button",
        [{"type": "notify", "config": {"recipients": ["assignee", 999999], "title": "T", "message": "{{task.title}}"}}],
        name="ok",
    )
    run = _run(ok, task)
    assert run.status == "success"
    assert Notification.objects.filter(user=person).exists()
    none = make_automation(ws, owner, "task.button", [{"type": "notify", "config": {"recipients": [999999], "message": "x"}}], name="none")
    run = _run(none, make_task(board, group))
    assert run.status == "success"
    assert "Nenhum destinatario" in run.actions_log[0]["detail"]


def test_move_to_group_rejects_group_from_other_board(setup):
    owner, board, group, ws = setup
    other = BoardFactory(project=board.project)
    foreign_group = BoardGroup.objects.create(board=other, name="O", position=1)
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "move_to_group", "config": {"group_id": str(foreign_group.pk)}}])
    assert _run(auto, task).status == "failed"
    task.refresh_from_db()
    assert task.group_id == group.pk


def test_archive_is_idempotent(setup):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "archive_task", "config": {}}])
    _run(auto, task)
    first = Task.objects.get(pk=task.pk).archived_at
    task.refresh_from_db()
    run = _run(auto, task)
    assert run.status == "success"
    assert Task.objects.get(pk=task.pk).archived_at == first


def test_set_due_date_clear_and_invalid(setup):
    owner, board, group, ws = setup
    task = make_task(board, group, end_date=timezone.now())
    clear = make_automation(ws, owner, "task.button", [{"type": "set_due_date", "config": {"clear": True}}], name="c")
    _run(clear, task)
    task.refresh_from_db()
    assert task.end_date is None
    bad = make_automation(ws, owner, "task.button", [{"type": "set_due_date", "config": {"days_from_now": "abc"}}], name="b")
    assert _run(bad, task).status == "failed"


@pytest.mark.parametrize(
    ("cfg", "ok"),
    [
        ({"points": 0}, True),
        ({"points": 12.5}, True),
        ({"points": -1}, False),
        ({"points": "10"}, False),
        ({"points": True}, False),
        ({"points": 10000}, False),
        ({}, False),
    ],
)
def test_set_effort_validation(setup, cfg, ok):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": cfg}])
    assert (_run(auto, task).status == "success") is ok


@pytest.mark.parametrize(
    ("start", "amount", "unit", "expected"),
    [
        (datetime(2026, 12, 15, tzinfo=dt_timezone.utc), 1, "months", (2027, 1, 15)),
        (datetime(2026, 3, 31, tzinfo=dt_timezone.utc), -1, "months", (2026, 2, 28)),
        (datetime(2028, 1, 31, tzinfo=dt_timezone.utc), 1, "months", (2028, 2, 29)),
        (datetime(2026, 1, 1, tzinfo=dt_timezone.utc), 2, "weeks", (2026, 1, 15)),
        (datetime(2026, 1, 10, tzinfo=dt_timezone.utc), -3, "days", (2026, 1, 7)),
        (datetime(2026, 1, 31, tzinfo=dt_timezone.utc), 12, "months", (2027, 1, 31)),
    ],
)
def test_push_date_arithmetic(setup, start, amount, unit, expected):
    owner, board, group, ws = setup
    task = make_task(board, group, end_date=start)
    auto = make_automation(ws, owner, "task.button", [{"type": "push_date", "config": {"amount": amount, "unit": unit}}])
    assert _run(auto, task).status == "success"
    task.refresh_from_db()
    assert (task.end_date.year, task.end_date.month, task.end_date.day) == expected


@pytest.mark.parametrize(
    "cfg",
    [
        {"amount": 0},
        {"amount": "2"},
        {"amount": True},
        {"amount": 1, "unit": "years"},
        {"amount": 1, "field": "title"},
        {"amount": 99999},
    ],
)
def test_push_date_rejects_bad_config(setup, cfg):
    owner, board, group, ws = setup
    task = make_task(board, group, end_date=timezone.now())
    auto = make_automation(ws, owner, "task.button", [{"type": "push_date", "config": cfg}])
    assert _run(auto, task).status == "failed"


def test_push_date_start_date_field(setup):
    owner, board, group, ws = setup
    start = datetime(2026, 6, 1, tzinfo=dt_timezone.utc)
    task = make_task(board, group, start_date=start)
    auto = make_automation(ws, owner, "task.button", [{"type": "push_date", "config": {"field": "start_date", "amount": 7}}])
    assert _run(auto, task).status == "success"
    task.refresh_from_db()
    assert task.start_date.day == 8


@pytest.mark.parametrize("bad_group", ["abc", "", None, 123, "00000000-0000-0000-0000-000000000000"])
@pytest.mark.parametrize("action", ["move_to_board", "create_task"])
def test_cross_board_actions_survive_garbage_group_ids(setup, action, bad_group):
    owner, board, group, ws = setup
    task = make_task(board, group)
    cfg = {"group_id": bad_group, "title": "x"}
    auto = make_automation(ws, owner, "task.button", [{"type": action, "config": cfg}])
    run = _run(auto, task)  # nunca levanta
    assert run.status == "failed"
    task.refresh_from_db()
    assert task.board_id == board.pk
    assert Task.objects.count() == 1


def test_move_to_board_same_board_is_refused(setup):
    owner, board, group, ws = setup
    other_group = BoardGroup.objects.create(board=board, name="Outro", position=2)
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "move_to_board", "config": {"group_id": str(other_group.pk)}}])
    assert _run(auto, task).status == "failed"


def test_move_to_board_allocates_unique_numbers_in_target(setup):
    owner, board, group, ws = setup
    other = BoardFactory(project=board.project)
    dest = BoardGroup.objects.create(board=other, name="D", position=1)
    existing = Task.objects.create(board=other, group=dest, title="Ja existe", number=1)
    task = make_task(board, group, number=1)
    child = Task.objects.create(board=board, group=group, parent=task, title="Filha", number=2)
    auto = make_automation(ws, owner, "task.button", [{"type": "move_to_board", "config": {"group_id": str(dest.pk)}}])
    assert _run(auto, task).status == "success"
    numbers = list(Task.objects.filter(board=other).values_list("number", flat=True))
    assert len(numbers) == len(set(numbers)) == 3
    assert existing.number in numbers
    child.refresh_from_db()
    assert child.board_id == other.pk


def test_duplicate_defaults_to_same_group_and_keeps_fields(setup):
    owner, board, group, ws = setup
    person = UserFactory()
    task = make_task(board, group, title="Base", priority="high", assignee=person, description="desc", effort_points=Decimal("3"))
    auto = make_automation(ws, owner, "task.button", [{"type": "duplicate_task", "config": {}}])
    assert _run(auto, task).status == "success"
    copy = Task.objects.exclude(pk=task.pk).get()
    assert (copy.title, copy.group_id, copy.board_id) == ("Base (copia)", group.pk, board.pk)
    assert (copy.priority, copy.assignee_id, copy.description, float(copy.effort_points)) == ("high", person.pk, "desc", 3.0)
    assert copy.status == "todo"
    assert copy.number != task.number


def test_create_task_renders_title_and_assignee(setup):
    owner, board, group, ws = setup
    person = UserFactory()
    task = make_task(board, group, title="Mae")
    auto = make_automation(
        ws, owner, "task.button",
        [{"type": "create_task", "config": {"group_id": str(group.pk), "title": "Filha de {{task.title}}", "assignee_id": person.pk}}],
    )
    assert _run(auto, task).status == "success"
    new = Task.objects.get(title="Filha de Mae")
    assert new.assignee_id == person.pk


def test_create_task_blank_title_fails(setup):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "create_task", "config": {"group_id": str(group.pk), "title": "   "}}])
    assert _run(auto, task).status == "failed"


@pytest.mark.parametrize(
    "action",
    [
        {"type": "set_status", "config": {"status": "done"}},
        {"type": "set_priority", "config": {"priority": "critical"}},
        {"type": "set_due_date", "config": {"days_from_now": 3}},
        {"type": "push_date", "config": {"amount": 3}},
        {"type": "set_effort", "config": {"points": 9}},
        {"type": "add_comment", "config": {"content": "oi"}},
        {"type": "create_subtask", "config": {"title": "sub"}},
        {"type": "archive_task", "config": {}},
        {"type": "delete_task", "config": {}},
        {"type": "duplicate_task", "config": {}},
        {"type": "create_task", "config": {"title": "novo"}},
        {"type": "move_to_board", "config": {}},
    ],
)
def test_dry_run_never_changes_anything(setup, action):
    owner, board, group, ws = setup
    other = BoardFactory(project=board.project)
    dest = BoardGroup.objects.create(board=other, name="D", position=1)
    action = {**action, "config": {**action["config"]}}
    TaskStatusDefinition.objects.get_or_create(key="done", defaults={"label": "Concluida", "is_done_like": True})
    if action["type"] in {"create_task", "move_to_board"}:
        action["config"]["group_id"] = str(dest.pk)
    task = make_task(board, group, end_date=timezone.now())
    before = Task.objects.filter(pk=task.pk).values().get()
    count = Task.objects.count()
    auto = make_automation(ws, owner, "task.button", [action])
    run = _run(auto, task, dry_run=True)
    assert run.is_dry_run and run.status == "success", run.actions_log
    assert Task.objects.count() == count
    assert Task.objects.filter(pk=task.pk).values().get() == before
    auto.refresh_from_db()
    assert auto.run_count == 0


def test_delete_task_real_run_removes_task_but_not_dry(setup):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "delete_task", "config": {}}])
    _run(auto, task, dry_run=True)
    assert Task.objects.filter(pk=task.pk).exists()
    _run(auto, task)
    assert not Task.objects.filter(pk=task.pk).exists()
    auto.refresh_from_db()
    assert auto.run_count == 1


def test_unknown_action_in_stored_automation_is_logged_not_raised(setup):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "hack", "config": {}}, {"type": "set_effort", "config": {"points": 2}}])
    run = _run(auto, task)
    assert run.status == "failed"
    assert "desconhecida" in run.error_message


def test_run_count_and_last_run_updated(setup):
    owner, board, group, ws = setup
    task = make_task(board, group)
    auto = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 2}}])
    _run(auto, task)
    _run(auto, task)
    auto.refresh_from_db()
    assert auto.run_count == 2 and auto.last_run_at is not None


# --- Agendamento ----------------------------------------------------------------

def test_due_soon_ignores_past_and_far_dates(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.due_soon", [{"type": "set_effort", "config": {"points": 8}}], trigger_config={"days_before": 2})
    now = timezone.now()
    near = make_task(board, group, end_date=now + timedelta(days=1))
    far = make_task(board, group, end_date=now + timedelta(days=10))
    past = make_task(board, group, end_date=now - timedelta(days=1))
    engine.run_scheduled_automations(now=now)
    for t in (near, far, past):
        t.refresh_from_db()
    assert float(near.effort_points) == 8
    assert float(far.effort_points) == 1 and float(past.effort_points) == 1


def test_overdue_skips_done_tasks(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.overdue", [{"type": "set_effort", "config": {"points": 6}}])
    done = make_task(board, group, status="done", end_date=timezone.now() - timedelta(days=2))
    open_ = make_task(board, group, end_date=timezone.now() - timedelta(days=2))
    engine.run_scheduled_automations()
    done.refresh_from_db()
    open_.refresh_from_db()
    assert float(done.effort_points) == 1
    assert float(open_.effort_points) == 6


def test_scheduled_conditions_are_respected(setup):
    owner, board, group, ws = setup
    make_automation(
        ws, owner, "task.overdue", [{"type": "set_effort", "config": {"points": 6}}],
        conditions=[{"field": "priority", "op": "eq", "value": "high"}],
    )
    t = make_task(board, group, end_date=timezone.now() - timedelta(days=1))
    engine.run_scheduled_automations()
    t.refresh_from_db()
    assert float(t.effort_points) == 1


@pytest.mark.parametrize(
    ("cfg", "now", "expected_utc"),
    [
        # Sao Paulo = UTC-3. Diario 09h; agora 08h local -> ontem 09h local.
        ({"frequency": "daily", "hour": 9}, datetime(2026, 11, 9, 11, 0, tzinfo=dt_timezone.utc), datetime(2026, 11, 8, 12, 0, tzinfo=dt_timezone.utc)),
        # agora 10h local -> hoje 09h local.
        ({"frequency": "daily", "hour": 9}, datetime(2026, 11, 9, 13, 0, tzinfo=dt_timezone.utc), datetime(2026, 11, 9, 12, 0, tzinfo=dt_timezone.utc)),
        # Semanal, segunda (0) 09h; 2026-11-09 e segunda; 08h local -> segunda anterior.
        ({"frequency": "weekly", "weekday": 0, "hour": 9}, datetime(2026, 11, 9, 11, 0, tzinfo=dt_timezone.utc), datetime(2026, 11, 2, 12, 0, tzinfo=dt_timezone.utc)),
        ({"frequency": "weekly", "weekday": 0, "hour": 9}, datetime(2026, 11, 12, 15, 0, tzinfo=dt_timezone.utc), datetime(2026, 11, 9, 12, 0, tzinfo=dt_timezone.utc)),
        # Mensal dia 15; agora dia 9 -> 15 do mes anterior.
        ({"frequency": "monthly", "day_of_month": 15, "hour": 9}, datetime(2026, 11, 9, 13, 0, tzinfo=dt_timezone.utc), datetime(2026, 10, 15, 12, 0, tzinfo=dt_timezone.utc)),
        ({"frequency": "monthly", "day_of_month": 5, "hour": 9}, datetime(2026, 11, 9, 13, 0, tzinfo=dt_timezone.utc), datetime(2026, 11, 5, 12, 0, tzinfo=dt_timezone.utc)),
        # Janeiro olhando para dezembro do ano anterior.
        ({"frequency": "monthly", "day_of_month": 20, "hour": 9}, datetime(2027, 1, 3, 13, 0, tzinfo=dt_timezone.utc), datetime(2026, 12, 20, 12, 0, tzinfo=dt_timezone.utc)),
    ],
)
def test_last_scheduled_instant(cfg, now, expected_utc):
    assert engine.last_scheduled_instant(cfg, now) == expected_utc


def test_recurring_fires_once_per_window(setup):
    owner, board, group, ws = setup
    auto = make_automation(
        ws, owner, "schedule.recurring", [{"type": "set_effort", "config": {"points": 5}}],
        trigger_config={"frequency": "daily", "hour": 9},
    )
    task = make_task(board, group)
    t0 = datetime(2026, 11, 9, 11, 0, tzinfo=dt_timezone.utc)  # 08h local
    engine.run_scheduled_automations(now=t0)  # marca o ponto de partida
    assert engine.run_scheduled_automations(now=t0 + timedelta(hours=2))["ran"] == 1  # 10h local
    assert engine.run_scheduled_automations(now=t0 + timedelta(hours=3))["ran"] == 0  # mesma janela
    assert engine.run_scheduled_automations(now=t0 + timedelta(days=1, hours=2))["ran"] == 1  # dia seguinte
    task.refresh_from_db()
    assert float(task.effort_points) == 5
    auto.refresh_from_db()
    assert auto.last_scheduled_at is not None


# --- Anti-laco ------------------------------------------------------------------

def test_duplicate_on_created_stops_at_depth_limit(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.created", [{"type": "duplicate_task", "config": {}}])
    make_task(board, group)
    total = Task.objects.count()
    assert 2 <= total <= engine.MAX_DEPTH + 2  # cresce, mas para


def test_two_automations_ping_pong_priority_is_bounded(setup):
    owner, board, group, ws = setup
    make_automation(ws, owner, "task.priority_changed", [{"type": "set_priority", "config": {"priority": "low"}}], trigger_config={"to_priority": "high"}, name="a")
    make_automation(ws, owner, "task.priority_changed", [{"type": "set_priority", "config": {"priority": "high"}}], trigger_config={"to_priority": "low"}, name="b")
    task = make_task(board, group)
    task.priority = "high"
    task.save(update_fields=["priority"])
    assert AutomationRun.objects.count() <= engine.MAX_DEPTH + 1


# --- API ------------------------------------------------------------------------

def _payload(ws, **over):
    base = {
        "workspace_id": str(ws.pk),
        "name": "Receita",
        "trigger_type": "task.created",
        "actions": [{"type": "set_priority", "config": {"priority": "high"}}],
    }
    base.update(over)
    return base


def test_api_requires_authentication(setup):
    assert APIClient().get("/api/v1/automations").status_code in (401, 403)
    assert APIClient().get("/api/v1/automations/catalog").status_code in (401, 403)


def test_api_collaborator_cannot_read_anything(setup):
    client = APIClient()
    client.force_authenticate(UserFactory())
    for url in ("/api/v1/automations", "/api/v1/automations/catalog", "/api/v1/automations/runs"):
        assert client.get(url).status_code == 403


def test_api_importance_default_set_and_invalid(setup, staff_client):
    owner, board, group, ws = setup
    created = staff_client.post("/api/v1/automations", _payload(ws), format="json")
    assert created.status_code == 201
    assert created.json()["data"]["automation"]["importance"] == "normal"
    aid = created.json()["data"]["automation"]["id"]
    assert staff_client.post("/api/v1/automations", _payload(ws, importance="urgentissima"), format="json").status_code == 400
    assert staff_client.post("/api/v1/automations", _payload(ws, importance="critical", name="B"), format="json").json()["data"]["automation"]["importance"] == "critical"
    assert staff_client.patch(f"/api/v1/automations/{aid}", {"importance": "low"}, format="json").json()["data"]["automation"]["importance"] == "low"
    assert staff_client.patch(f"/api/v1/automations/{aid}", {"importance": "x"}, format="json").status_code == 400


@pytest.mark.parametrize(
    "over",
    [
        {"name": "   "},
        {"name": None},
        {"trigger_type": "nada"},
        {"actions": []},
        {"workspace_id": "nao-e-uuid"},
        {"workspace_id": "00000000-0000-0000-0000-000000000000"},
        {"board_id": "nao-e-uuid"},
        {"conditions": [{"field": "x", "op": "eq"}]},
    ],
)
def test_api_create_rejects_bad_payloads(setup, staff_client, over):
    owner, board, group, ws = setup
    resp = staff_client.post("/api/v1/automations", _payload(ws, **over), format="json")
    assert resp.status_code == 400, resp.content
    assert Automation.objects.count() == 0


def test_api_board_from_other_workspace_is_rejected(setup, staff_client):
    owner, board, group, ws = setup
    foreign = BoardFactory()
    resp = staff_client.post("/api/v1/automations", _payload(ws, board_id=str(foreign.pk)), format="json")
    assert resp.status_code == 400


def test_api_list_filters_by_workspace_and_board(setup, staff_client):
    owner, board, group, ws = setup
    other_ws_board = BoardFactory()
    other_ws = other_ws_board.project.portfolio.workspace
    make_automation(ws, owner, "task.created", [{"type": "archive_task", "config": {}}], name="aqui")
    make_automation(other_ws, owner, "task.created", [{"type": "archive_task", "config": {}}], name="la")
    make_automation(ws, owner, "task.created", [{"type": "archive_task", "config": {}}], name="do-quadro", board=board)
    names = lambda url: sorted(a["name"] for a in staff_client.get(url).json()["data"]["automations"])  # noqa: E731
    assert names(f"/api/v1/automations?workspace_id={ws.pk}") == ["aqui", "do-quadro"]
    assert names(f"/api/v1/automations?workspace_id={other_ws.pk}") == ["la"]
    assert names(f"/api/v1/automations?board_id={board.pk}") == ["do-quadro"]
    assert staff_client.get("/api/v1/automations?workspace_id=xyz").status_code == 400


def test_api_detail_404_and_delete_cascades_runs(setup, staff_client):
    owner, board, group, ws = setup
    assert staff_client.get("/api/v1/automations/00000000-0000-0000-0000-000000000000").status_code == 404
    assert staff_client.delete("/api/v1/automations/00000000-0000-0000-0000-000000000000").status_code == 404
    auto = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 2}}])
    _run(auto, make_task(board, group))
    assert AutomationRun.objects.count() == 1
    assert staff_client.delete(f"/api/v1/automations/{auto.pk}").status_code == 200
    assert AutomationRun.objects.count() == 0


def test_api_patch_partial_keeps_other_fields(setup, staff_client):
    owner, board, group, ws = setup
    auto = make_automation(
        ws, owner, "task.status_changed", [{"type": "set_effort", "config": {"points": 2}}],
        trigger_config={"to_status": "done"}, name="Original",
    )
    resp = staff_client.patch(f"/api/v1/automations/{auto.pk}", {"name": "Novo nome"}, format="json")
    assert resp.status_code == 200
    auto.refresh_from_db()
    assert auto.name == "Novo nome"
    assert auto.trigger_config == {"to_status": "done"} and auto.actions[0]["config"] == {"points": 2}
    assert staff_client.patch(f"/api/v1/automations/{auto.pk}", {"name": " "}, format="json").status_code == 400


def test_api_run_now_dry_and_real_and_errors(setup, staff_client):
    owner, board, group, ws = setup
    auto = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 9}}])
    task = make_task(board, group)
    dry = staff_client.post(f"/api/v1/automations/{auto.pk}/run", {"task_id": str(task.pk), "dry_run": True}, format="json")
    assert dry.status_code == 200
    task.refresh_from_db()
    assert float(task.effort_points) == 1
    real = staff_client.post(f"/api/v1/automations/{auto.pk}/run", {"task_id": str(task.pk), "dry_run": False}, format="json")
    assert real.status_code == 200
    task.refresh_from_db()
    assert float(task.effort_points) == 9
    for bad in ({}, {"task_id": "lixo"}, {"task_id": "00000000-0000-0000-0000-000000000000"}):
        assert staff_client.post(f"/api/v1/automations/{auto.pk}/run", bad, format="json").status_code in (400, 404)


def test_api_run_now_cannot_touch_task_of_other_workspace(setup, staff_client):
    owner, board, group, ws = setup
    foreign_board = BoardFactory()
    foreign_group = BoardGroup.objects.create(board=foreign_board, name="X", position=1)
    foreign_task = make_task(foreign_board, foreign_group)
    auto = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 9}}])
    resp = staff_client.post(f"/api/v1/automations/{auto.pk}/run", {"task_id": str(foreign_task.pk), "dry_run": False}, format="json")
    foreign_task.refresh_from_db()
    assert float(foreign_task.effort_points) == 1, resp.content


def test_api_runs_history_per_automation_and_global(setup, staff_client):
    owner, board, group, ws = setup
    a = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 2}}], name="A")
    b = make_automation(ws, owner, "task.button", [{"type": "set_effort", "config": {"points": 3}}], name="B")
    task = make_task(board, group)
    _run(a, task)
    _run(b, task)
    _run(b, task)
    assert len(staff_client.get(f"/api/v1/automations/{a.pk}/runs").json()["data"]["runs"]) == 1
    assert len(staff_client.get(f"/api/v1/automations/{b.pk}/runs").json()["data"]["runs"]) == 2
    assert len(staff_client.get("/api/v1/automations/runs").json()["data"]["runs"]) == 3


def test_api_catalog_is_complete_and_scoped(setup, staff_client):
    owner, board, group, ws = setup
    data = staff_client.get("/api/v1/automations/catalog").json()["data"]
    assert {t["type"] for t in data["triggers"]} == set(TRIGGERS)
    assert {a["type"] for a in data["actions"]} == set(ACTIONS)
    assert any(g["workspace_id"] == str(ws.pk) and "Backlog" in g["label"] for g in data["target_groups"])
    assert "parent_id" in data["condition_fields"]
    for recipe in data["recipes"]:  # toda receita pronta tem que ser valida
        assert validate_definition(
            trigger_type=recipe["trigger_type"], trigger_config=recipe["trigger_config"],
            conditions=recipe["conditions"], actions=recipe["actions"],
        ) == {}, recipe["key"]


def test_api_writes_leave_audit_trail(setup, staff_client):
    from blackbeans_api.governance.models import AuditLog

    owner, board, group, ws = setup
    aid = staff_client.post("/api/v1/automations", _payload(ws), format="json").json()["data"]["automation"]["id"]
    staff_client.patch(f"/api/v1/automations/{aid}", {"name": "X"}, format="json")
    staff_client.delete(f"/api/v1/automations/{aid}")
    kinds = set(AuditLog.objects.filter(entity_type="automation").values_list("event_type", flat=True))
    assert {"automation.created", "automation.updated", "automation.deleted"} <= kinds


def test_set_status_real_run_moves_task_and_unknown_status_fails(setup):
    owner, board, group, ws = setup
    TaskStatusDefinition.objects.get_or_create(key="done", defaults={"label": "Concluida", "is_done_like": True})
    task = make_task(board, group)
    ok = make_automation(ws, owner, "task.button", [{"type": "set_status", "config": {"status": "done"}}], name="ok")
    assert _run(ok, task).status == "success"
    task.refresh_from_db()
    assert task.status == "done"
    TaskStatusDefinition.objects.filter(key="done").update(is_active=False)
    task2 = make_task(board, group)
    assert _run(ok, task2).status == "failed"


def test_seed_demo_is_idempotent_and_workspace_wide(setup):
    from django.core.management import call_command

    owner, board, group, ws = setup
    ws.name = "Produção"
    ws.save(update_fields=["name"])
    owner.username = "admin.teste"
    owner.save(update_fields=["username"])
    call_command("seed_automations_demo")
    call_command("seed_automations_demo")
    demos = Automation.objects.filter(name__startswith="[DEMO] ")
    assert demos.count() == 8
    assert not demos.exclude(board__isnull=True).exists()
