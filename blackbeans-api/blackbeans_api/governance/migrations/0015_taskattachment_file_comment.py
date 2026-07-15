# Generated manually for task attachment file + comment link

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0014_task_parent_subtasks"),
    ]

    operations = [
        migrations.AddField(
            model_name="taskattachment",
            name="comment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="attachments",
                to="governance.taskcomment",
            ),
        ),
        migrations.AddField(
            model_name="taskattachment",
            name="file",
            field=models.FileField(blank=True, null=True, upload_to="task_attachments/%Y/%m/"),
        ),
    ]
