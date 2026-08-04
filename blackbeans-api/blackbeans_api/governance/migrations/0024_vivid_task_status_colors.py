from django.db import migrations


VIVID_COLORS = {
    "todo": "geekblue",
    "in_progress": "blue",
    "blocked": "volcano",
    "done": "green",
}

# Cores antigas/pastel que devem ser promovidas automaticamente
LEGACY_COLORS = {
    "todo": {"default", "#94a3b8", "#64748b", "#cbd5e1", ""},
    "in_progress": {"processing", "#3b82f6", "#2563eb", "#60a5fa", ""},
    "blocked": {"warning", "error", "#ef4444", "#f97316", ""},
    "done": {"success", "#22c55e", "#16a34a", "#4ade80", ""},
}


def upgrade_status_colors(apps, schema_editor):
    TaskStatusDefinition = apps.get_model("governance", "TaskStatusDefinition")
    for key, vivid in VIVID_COLORS.items():
        row = TaskStatusDefinition.objects.filter(key=key).first()
        if not row:
            continue
        current = (row.color or "").strip().lower()
        legacy = {c.lower() for c in LEGACY_COLORS.get(key, set())}
        if current in legacy or current == "":
            row.color = vivid
            row.save(update_fields=["color", "updated_at"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0023_task_priority_critical"),
    ]

    operations = [
        migrations.RunPython(upgrade_status_colors, noop_reverse),
    ]
