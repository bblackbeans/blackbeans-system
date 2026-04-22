from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskAttachment
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import TimeLog
from blackbeans_api.users.models import User


class WorkspaceWriteSerializer(serializers.ModelSerializer):
    client_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Workspace
        fields = ("name", "client_id")
        extra_kwargs = {"name": {"required": True}}

    def validate_client_id(self, value):
        if value is None:
            return None
        if not Client.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Cliente nao encontrado.")
        return value

    def create(self, validated_data):
        client_id = validated_data.pop("client_id", None)
        return Workspace.objects.create(client_id=client_id, **validated_data)

    def update(self, instance, validated_data):
        if "client_id" in validated_data:
            instance.client_id = validated_data.pop("client_id")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


def workspace_to_representation(workspace: Workspace) -> dict:
    return {
        "id": str(workspace.pk),
        "name": workspace.name,
        "client_id": str(workspace.client_id) if workspace.client_id else None,
        "created_at": workspace.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": workspace.updated_at.isoformat().replace("+00:00", "Z"),
    }


class PortfolioWriteSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField()

    class Meta:
        model = Portfolio
        fields = ("workspace_id", "name", "description")
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True, "default": ""},
        }

    def validate_workspace_id(self, value):
        if not Workspace.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Workspace nao encontrado.")
        return value

    def create(self, validated_data):
        workspace_id = validated_data.pop("workspace_id")
        return Portfolio.objects.create(workspace_id=workspace_id, **validated_data)

    def update(self, instance, validated_data):
        if "workspace_id" in validated_data:
            instance.workspace_id = validated_data.pop("workspace_id")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


def portfolio_to_representation(portfolio: Portfolio) -> dict:
    return {
        "id": str(portfolio.pk),
        "workspace_id": str(portfolio.workspace_id),
        "name": portfolio.name,
        "description": portfolio.description,
        "created_at": portfolio.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": portfolio.updated_at.isoformat().replace("+00:00", "Z"),
    }


class ProjectWriteSerializer(serializers.ModelSerializer):
    portfolio_id = serializers.UUIDField(required=False)
    client_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Project
        fields = (
            "portfolio_id",
            "client_id",
            "name",
            "description",
            "status",
            "start_date",
            "end_date",
            "actual_start_date",
            "actual_end_date",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True, "default": ""},
            "status": {"required": False},
            "start_date": {"required": False, "allow_null": True},
            "end_date": {"required": False, "allow_null": True},
            "actual_start_date": {"required": False, "allow_null": True},
            "actual_end_date": {"required": False, "allow_null": True},
        }

    def validate_portfolio_id(self, value):
        if not Portfolio.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Portfolio nao encontrado.")
        return value

    def validate_client_id(self, value):
        if value is None:
            return None
        if not Client.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Cliente nao encontrado.")
        return value

    def validate(self, attrs):
        if attrs.get("actual_start_date") and attrs.get("actual_end_date"):
            if attrs["actual_end_date"] < attrs["actual_start_date"]:
                raise serializers.ValidationError(
                    {"actual_end_date": "Data final real deve ser maior ou igual a inicial."},
                )
        if attrs.get("start_date") and attrs.get("end_date"):
            if attrs["end_date"] < attrs["start_date"]:
                raise serializers.ValidationError(
                    {"end_date": "Data final planejada deve ser maior ou igual a inicial."},
                )
        return attrs

    def create(self, validated_data):
        portfolio_id = validated_data.pop("portfolio_id")
        client_id = validated_data.pop("client_id", None)
        return Project.objects.create(
            portfolio_id=portfolio_id,
            client_id=client_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        if "portfolio_id" in validated_data:
            instance.portfolio_id = validated_data.pop("portfolio_id")
        if "client_id" in validated_data:
            instance.client_id = validated_data.pop("client_id")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


def project_to_representation(project: Project) -> dict:
    def _iso(v):
        return v.isoformat().replace("+00:00", "Z") if v else None

    return {
        "id": str(project.pk),
        "portfolio_id": str(project.portfolio_id),
        "workspace_id": str(project.portfolio.workspace_id),
        "client_id": str(project.client_id) if project.client_id else None,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "start_date": _iso(project.start_date),
        "end_date": _iso(project.end_date),
        "actual_start_date": _iso(project.actual_start_date),
        "actual_end_date": _iso(project.actual_end_date),
        "created_at": _iso(project.created_at),
        "updated_at": _iso(project.updated_at),
    }


class BoardWriteSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField()

    class Meta:
        model = Board
        fields = ("project_id", "name")

    def validate_project_id(self, value):
        if not Project.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Projeto nao encontrado.")
        return value

    def create(self, validated_data):
        project_id = validated_data.pop("project_id")
        return Board.objects.create(project_id=project_id, **validated_data)


def board_to_representation(board: Board) -> dict:
    return {
        "id": str(board.pk),
        "project_id": str(board.project_id),
        "workspace_id": str(board.project.portfolio.workspace_id),
        "name": board.name,
        "created_at": board.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": board.updated_at.isoformat().replace("+00:00", "Z"),
    }


class BoardGroupCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardGroup
        fields = ("name", "wip_limit")

    def validate_wip_limit(self, value):
        if value < 1:
            raise serializers.ValidationError("wip_limit deve ser maior ou igual a 1.")
        return value


class BoardGroupUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardGroup
        fields = ("name", "position", "wip_limit")
        extra_kwargs = {
            "name": {"required": False},
            "position": {"required": False},
            "wip_limit": {"required": False},
        }

    def validate_wip_limit(self, value):
        if value < 1:
            raise serializers.ValidationError("wip_limit deve ser maior ou igual a 1.")
        return value

    def validate_position(self, value):
        if value < 1:
            raise serializers.ValidationError("position deve ser maior ou igual a 1.")
        return value


def board_group_to_representation(group: BoardGroup) -> dict:
    return {
        "id": str(group.pk),
        "board_id": str(group.board_id),
        "name": group.name,
        "position": group.position,
        "wip_limit": group.wip_limit,
        "created_at": group.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": group.updated_at.isoformat().replace("+00:00", "Z"),
    }


class TaskWriteSerializer(serializers.ModelSerializer):
    group_id = serializers.UUIDField()
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Task
        fields = (
            "group_id",
            "title",
            "description",
            "status",
            "priority",
            "effort_points",
            "assignee_id",
            "start_date",
            "end_date",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True, "default": ""},
            "status": {"required": False},
            "priority": {"required": False},
            "effort_points": {"required": False},
            "start_date": {"required": False, "allow_null": True},
            "end_date": {"required": False, "allow_null": True},
        }

    def validate_group_id(self, value):
        if not BoardGroup.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Grupo nao encontrado.")
        return value

    def validate_assignee_id(self, value):
        if value is None:
            return None
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Usuario responsavel nao encontrado.")
        return value

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Data final deve ser maior ou igual a inicial."})
        return attrs

    def create(self, validated_data):
        group_id = validated_data.pop("group_id")
        assignee_id = validated_data.pop("assignee_id", None)
        group = BoardGroup.objects.select_related("board").get(pk=group_id)
        return Task.objects.create(
            group=group,
            board=group.board,
            assignee_id=assignee_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        if "group_id" in validated_data:
            group = BoardGroup.objects.select_related("board").get(pk=validated_data.pop("group_id"))
            instance.group = group
            instance.board = group.board
        if "assignee_id" in validated_data:
            instance.assignee_id = validated_data.pop("assignee_id")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


def task_to_representation(task: Task) -> dict:
    def _iso(v):
        return v.isoformat().replace("+00:00", "Z") if v else None

    return {
        "id": str(task.pk),
        "board_id": str(task.board_id),
        "group_id": str(task.group_id),
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "effort_points": task.effort_points,
        "assignee_id": task.assignee_id,
        "start_date": _iso(task.start_date),
        "end_date": _iso(task.end_date),
        "created_at": _iso(task.created_at),
        "updated_at": _iso(task.updated_at),
    }


class TaskAssigneeSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(min_value=1)


class TaskDependencyCreateSerializer(serializers.Serializer):
    depends_on_task_id = serializers.UUIDField()


class TaskCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskComment
        fields = ("content",)


class TaskAttachmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskAttachment
        fields = ("filename", "content_type", "size_bytes")

    def validate_size_bytes(self, value):
        if value < 0:
            raise serializers.ValidationError("size_bytes deve ser maior ou igual a zero.")
        if value > 20 * 1024 * 1024:
            raise serializers.ValidationError("Arquivo excede limite de 20MB.")
        return value


class TimeLogUpdateSerializer(serializers.Serializer):
    started_at = serializers.DateTimeField(required=False)
    ended_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        started_at = attrs.get("started_at")
        ended_at = attrs.get("ended_at")
        if started_at and ended_at and ended_at <= started_at:
            raise serializers.ValidationError(
                {"ended_at": "Data final deve ser maior que a data inicial."},
            )
        return attrs


def time_log_to_representation(log: TimeLog) -> dict:
    def _iso(v):
        return v.isoformat().replace("+00:00", "Z") if v else None

    total_seconds = log.accumulated_seconds
    if log.status == TimeLog.Status.ACTIVE and log.current_started_at:
        elapsed = int((timezone.now() - log.current_started_at).total_seconds())
        total_seconds += max(elapsed, 0)

    return {
        "id": str(log.pk),
        "task_id": str(log.task_id),
        "user_id": log.user_id,
        "status": log.status,
        "started_at": _iso(log.started_at),
        "current_started_at": _iso(log.current_started_at),
        "ended_at": _iso(log.ended_at),
        "total_seconds": total_seconds,
        "created_at": _iso(log.created_at),
        "updated_at": _iso(log.updated_at),
    }


def notification_to_representation(notification: Notification) -> dict:
    def _iso(v):
        return v.isoformat().replace("+00:00", "Z") if v else None

    return {
        "id": str(notification.pk),
        "user_id": notification.user_id,
        "task_id": str(notification.task_id) if notification.task_id else None,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "channel": notification.channel,
        "metadata": notification.metadata,
        "is_read": notification.is_read,
        "read_at": _iso(notification.read_at),
        "created_at": _iso(notification.created_at),
    }
