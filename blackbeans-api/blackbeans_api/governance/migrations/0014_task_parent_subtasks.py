# Generated manually for task subtasks (parent FK)

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0013_rename_governance__user_id_8f1a2c_idx_governance__user_id_f87410_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="subtasks",
                to="governance.task",
            ),
        ),
        migrations.AddIndex(
            model_name="task",
            index=models.Index(fields=["parent"], name="governance__parent__8a0f1a_idx"),
        ),
    ]
