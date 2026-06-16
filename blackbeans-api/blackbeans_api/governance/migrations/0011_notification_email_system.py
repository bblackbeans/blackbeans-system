# Generated manually for notification email system

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("governance", "0010_seed_service_catalog"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="notification",
            name="actor",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="triggered_notifications",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="notification",
            name="digest_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="notification",
            name="email_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="notification",
            name="channel",
            field=models.CharField(
                choices=[("in_app", "In App"), ("email", "Email")],
                default="in_app",
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("task_assigned", "Task Assigned"),
                    ("task_completed", "Task Completed"),
                    ("task_overdue", "Task Overdue"),
                    ("task_due_soon", "Task Due Soon"),
                    ("task_commented", "Task Commented"),
                    ("task_mentioned", "Task Mentioned"),
                    ("task_status_changed", "Task Status Changed"),
                    ("task_priority_changed", "Task Priority Changed"),
                    ("task_updated", "Task Updated"),
                ],
                max_length=32,
            ),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "email_sent_at"], name="governance__user_id_8f1a2c_idx"),
        ),
        migrations.CreateModel(
            name="NotificationPreference",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("task_assigned", "Task Assigned"),
                            ("task_completed", "Task Completed"),
                            ("task_overdue", "Task Overdue"),
                            ("task_due_soon", "Task Due Soon"),
                            ("task_commented", "Task Commented"),
                            ("task_mentioned", "Task Mentioned"),
                            ("task_status_changed", "Task Status Changed"),
                            ("task_priority_changed", "Task Priority Changed"),
                            ("task_updated", "Task Updated"),
                        ],
                        max_length=32,
                    ),
                ),
                ("in_app_enabled", models.BooleanField(default=True)),
                (
                    "email_mode",
                    models.CharField(
                        choices=[
                            ("off", "Off"),
                            ("instant", "Instant"),
                            ("daily", "Daily Digest"),
                            ("weekly", "Weekly Digest"),
                        ],
                        default="instant",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_preferences",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Notification Preference",
                "verbose_name_plural": "Notification Preferences",
            },
        ),
        migrations.CreateModel(
            name="NotificationSubscription",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "target_type",
                    models.CharField(
                        choices=[("task", "Task"), ("board", "Board")],
                        max_length=16,
                    ),
                ),
                ("target_id", models.UUIDField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Notification Subscription",
                "verbose_name_plural": "Notification Subscriptions",
            },
        ),
        migrations.CreateModel(
            name="NotificationDigestItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "digest_mode",
                    models.CharField(
                        choices=[
                            ("off", "Off"),
                            ("instant", "Instant"),
                            ("daily", "Daily Digest"),
                            ("weekly", "Weekly Digest"),
                        ],
                        default="daily",
                        max_length=16,
                    ),
                ),
                ("scheduled_for", models.DateTimeField()),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "notification",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="digest_items",
                        to="governance.notification",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_digest_items",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Notification Digest Item",
                "verbose_name_plural": "Notification Digest Items",
            },
        ),
        migrations.CreateModel(
            name="NotificationDeliveryLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "channel",
                    models.CharField(
                        choices=[("in_app", "In App"), ("email", "Email")],
                        max_length=16,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("provider_message_id", models.CharField(blank=True, default="", max_length=255)),
                ("error", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "notification",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_logs",
                        to="governance.notification",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_delivery_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Notification Delivery Log",
                "verbose_name_plural": "Notification Delivery Logs",
            },
        ),
        migrations.AddConstraint(
            model_name="notificationpreference",
            constraint=models.UniqueConstraint(
                fields=("user", "event_type"),
                name="uniq_notification_preference_user_event",
            ),
        ),
        migrations.AddConstraint(
            model_name="notificationsubscription",
            constraint=models.UniqueConstraint(
                fields=("user", "target_type", "target_id"),
                name="uniq_notification_subscription_target",
            ),
        ),
        migrations.AddIndex(
            model_name="notificationsubscription",
            index=models.Index(fields=["target_type", "target_id"], name="governance__target__a1b2c3_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationdigestitem",
            index=models.Index(fields=["user", "sent_at", "scheduled_for"], name="governance__user_id_d4e5f6_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationdeliverylog",
            index=models.Index(fields=["user", "channel", "created_at"], name="governance__user_id_g7h8i9_idx"),
        ),
    ]
