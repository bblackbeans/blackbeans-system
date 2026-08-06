from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import ContractServiceLine
from blackbeans_api.governance.models import Workspace
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import Notification
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskAttachment
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import TaskStatusDefinition
from blackbeans_api.governance.models import TimeLog
from blackbeans_api.governance.notification_service import get_user_display_name
from blackbeans_api.users.models import User


def validate_active_task_status(value: str) -> str:
    key = (value or "").strip()
    if not key:
        raise serializers.ValidationError("Status invalido para tarefa.")
    if TaskStatusDefinition.objects.filter(key=key, is_active=True).exists():
        return key
    # Fallback: constantes legadas enquanto catalogo nao existir
    if key in dict(Task.Status.choices):
        return key
    raise serializers.ValidationError("Status invalido ou inativo no catalogo.")


def task_status_definition_to_representation(item: TaskStatusDefinition) -> dict:
    return {
        "id": str(item.pk),
        "key": item.key,
        "label": item.label,
        "color": item.color,
        "is_done_like": item.is_done_like,
        "position": item.position,
        "is_active": item.is_active,
        "created_at": item.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": item.updated_at.isoformat().replace("+00:00", "Z"),
    }


class TaskStatusDefinitionItemSerializer(serializers.Serializer):
    key = serializers.SlugField(max_length=64)
    label = serializers.CharField(max_length=255)
    color = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    is_done_like = serializers.BooleanField(required=False, default=False)
    position = serializers.IntegerField(min_value=0, required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class TaskStatusCatalogWriteSerializer(serializers.Serializer):
    statuses = TaskStatusDefinitionItemSerializer(many=True)

    def validate_statuses(self, value):
        if not value:
            raise serializers.ValidationError("Informe ao menos um status.")
        keys = [item["key"] for item in value]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Chaves de status devem ser unicas.")
        return value



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
    contract_line_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Project
        fields = (
            "portfolio_id",
            "client_id",
            "name",
            "description",
            "status",
            "contract_line_id",
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

    def validate_contract_line_id(self, value):
        if value is None:
            return None
        if not ContractServiceLine.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Linha de contrato nao encontrada.")
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
        contract_line_id = validated_data.pop("contract_line_id", None)
        return Project.objects.create(
            portfolio_id=portfolio_id,
            client_id=client_id,
            contract_line_id=contract_line_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        if "portfolio_id" in validated_data:
            instance.portfolio_id = validated_data.pop("portfolio_id")
        if "client_id" in validated_data:
            instance.client_id = validated_data.pop("client_id")
        if "contract_line_id" in validated_data:
            instance.contract_line_id = validated_data.pop("contract_line_id")
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
        "contract_line_id": str(project.contract_line_id) if project.contract_line_id else None,
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
    group_id = serializers.UUIDField(required=False)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Task
        fields = (
            "group_id",
            "parent_id",
            "title",
            "description",
            "status",
            "priority",
            "effort_points",
            "assignee_id",
            "start_date",
            "end_date",
            "is_recurring",
            "recurrence_frequency",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True, "default": ""},
            "status": {"required": False},
            "priority": {"required": False},
            "effort_points": {"required": False},
            "start_date": {"required": False, "allow_null": True},
            "end_date": {"required": False, "allow_null": True},
            "is_recurring": {"required": False},
            "recurrence_frequency": {"required": False, "allow_blank": True},
        }

    def validate_group_id(self, value):
        if not BoardGroup.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Grupo nao encontrado.")
        return value

    def validate_parent_id(self, value):
        if value is None:
            return None
        parent = Task.objects.filter(pk=value).first()
        if parent is None:
            raise serializers.ValidationError("Tarefa pai nao encontrada.")
        if parent.parent_id is not None:
            raise serializers.ValidationError("Subtarefas nao podem ter subtarefas.")
        return value

    def validate_assignee_id(self, value):
        if value is None:
            return None
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Usuario responsavel nao encontrado.")
        return value

    def validate_status(self, value):
        return validate_active_task_status(value)

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Data final deve ser maior ou igual a inicial."})

        if self.instance is None:
            parent_id = attrs.get("parent_id")
            group_id = attrs.get("group_id")
            if parent_id is None and group_id is None:
                raise serializers.ValidationError(
                    {"group_id": "Informe o grupo do quadro ou a tarefa pai (parent_id)."}
                )
        return attrs

    def create(self, validated_data):
        parent_id = validated_data.pop("parent_id", None)
        assignee_id = validated_data.pop("assignee_id", None)
        group_id = validated_data.pop("group_id", None)

        parent = None
        if parent_id is not None:
            parent = Task.objects.select_related("board", "group").get(pk=parent_id)
            group = parent.group
            board = parent.board
        else:
            group = BoardGroup.objects.select_related("board").get(pk=group_id)
            board = group.board

        return Task.objects.create(
            group=group,
            board=board,
            parent=parent,
            assignee_id=assignee_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data.pop("parent_id", None)
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


def task_to_representation(task: Task, request=None) -> dict:
    def _iso(v):
        return v.isoformat().replace("+00:00", "Z") if v else None

    subtasks_count = getattr(task, "subtasks_count", None)
    if subtasks_count is None:
        subtasks_count = task.subtasks.count() if getattr(task, "pk", None) else 0

    assignee = getattr(task, "assignee", None)
    assignee_name = None
    assignee_email = None
    assignee_avatar_url = None
    if assignee is not None:
        name = (getattr(assignee, "name", None) or "").strip()
        email = (getattr(assignee, "email", None) or "").strip()
        username = (getattr(assignee, "username", None) or "").strip()
        assignee_name = name or username or email or f"Usuario {assignee.pk}"
        assignee_email = email
        avatar = getattr(assignee, "avatar", None)
        if avatar:
            try:
                assignee_avatar_url = avatar.url
                if request is not None and assignee_avatar_url:
                    try:
                        assignee_avatar_url = request.build_absolute_uri(assignee_avatar_url)
                    except Exception:
                        pass
            except ValueError:
                assignee_avatar_url = None

    return {
        "id": str(task.pk),
        "board_id": str(task.board_id),
        "group_id": str(task.group_id),
        "parent_id": str(task.parent_id) if task.parent_id else None,
        "subtasks_count": int(subtasks_count),
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "effort_points": task.effort_points,
        "assignee_id": task.assignee_id,
        "assignee_name": assignee_name,
        "assignee_email": assignee_email,
        "assignee_avatar_url": assignee_avatar_url,
        "start_date": _iso(task.start_date),
        "end_date": _iso(task.end_date),
        "is_recurring": bool(getattr(task, "is_recurring", False)),
        "recurrence_frequency": getattr(task, "recurrence_frequency", None) or "",
        "created_at": _iso(task.created_at),
        "updated_at": _iso(task.updated_at),
    }


class TaskAssigneeSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(min_value=1)


class TaskDependencyCreateSerializer(serializers.Serializer):
    depends_on_task_id = serializers.UUIDField()


def normalize_media_file_url(file_url: str | None) -> str | None:
    """Garante URL publica `/media/...` (nunca path absoluto de disco)."""
    if not file_url:
        return None
    raw = str(file_url).strip()
    if not raw:
        return None
    # Ex.: /app/blackbeans_api/media/task_attachments/... ou https://host/media/...
    marker = "/media/"
    idx = raw.find(marker)
    if idx >= 0:
        return raw[idx:]
    # Storage relativo sem prefixo
    if "://" not in raw and not raw.startswith("/"):
        return f"/media/{raw.lstrip('/')}"
    return raw


def task_attachment_to_representation(attachment: TaskAttachment, request=None) -> dict:
    file_url = None
    if attachment.file:
        try:
            file_url = attachment.file.url
        except ValueError:
            file_url = None
        # Se o FileField guardou path absoluto, .url pode virar /app/.../media/...
        if not file_url and getattr(attachment.file, "name", None):
            file_url = str(attachment.file.name)
        file_url = normalize_media_file_url(file_url)
        # Preferir path /media/... (rewrite no frontend Next).
        if isinstance(file_url, str) and "/media/" in file_url:
            try:
                from urllib.parse import urlparse

                parsed = urlparse(file_url if "://" in file_url else f"http://local{file_url}")
                if parsed.path.startswith("/media/"):
                    file_url = f"{parsed.path}{('?' + parsed.query) if parsed.query else ''}"
            except Exception:
                pass
    return {
        "id": str(attachment.pk),
        "task_id": str(attachment.task_id),
        "comment_id": str(attachment.comment_id) if attachment.comment_id else None,
        "author_id": attachment.author_id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "url": file_url,
        "created_at": attachment.created_at.isoformat().replace("+00:00", "Z"),
    }


class TaskCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskComment
        fields = ("content",)


class TaskCommentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskComment
        fields = ("content",)


def task_comment_to_representation(comment: TaskComment, request=None) -> dict:
    cache = getattr(comment, "_prefetched_objects_cache", None) or {}
    if "attachments" in cache:
        attachments = list(cache["attachments"])
    else:
        attachments = list(comment.attachments.all())
    author = getattr(comment, "author", None)
    author_name = get_user_display_name(author) if author is not None else None
    payload = {
        "id": str(comment.pk),
        "task_id": str(comment.task_id),
        "author_id": comment.author_id,
        "author_name": author_name,
        "content": comment.content,
        "created_at": comment.created_at.isoformat().replace("+00:00", "Z"),
        "attachments": [task_attachment_to_representation(item, request=request) for item in attachments],
    }
    # Compatibilidade: modelo antigo nao possui updated_at.
    payload["updated_at"] = payload["created_at"]
    return payload


class TaskAttachmentCreateSerializer(serializers.ModelSerializer):
    comment_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = TaskAttachment
        fields = ("filename", "content_type", "size_bytes", "comment_id")

    def validate_size_bytes(self, value):
        if value < 0:
            raise serializers.ValidationError("size_bytes deve ser maior ou igual a zero.")
        if value > 20 * 1024 * 1024:
            raise serializers.ValidationError("Arquivo excede limite de 20MB.")
        return value

    def validate_content_type(self, value):
        raw = (value or "").strip().lower()
        if not raw or raw == "application/octet-stream":
            return raw
        allowed_prefixes = ("image/", "application/pdf", "application/zip", "application/x-zip-compressed", "text/")
        allowed_exact = {
            "text/plain",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }
        if raw.startswith(allowed_prefixes) or raw in allowed_exact:
            return raw
        raise serializers.ValidationError("Tipo de arquivo nao permitido.")


MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


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


class TimeLogManualCreateSerializer(serializers.Serializer):
    started_at = serializers.DateTimeField()
    ended_at = serializers.DateTimeField()

    def validate(self, attrs):
        started_at = attrs["started_at"]
        ended_at = attrs["ended_at"]
        if ended_at <= started_at:
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

    user = getattr(log, "user", None)
    if user is None and log.user_id:
        try:
            user = User.objects.get(pk=log.user_id)
        except User.DoesNotExist:
            user = None
    user_name = get_user_display_name(user) if user is not None else f"Usuario {log.user_id}"

    return {
        "id": str(log.pk),
        "task_id": str(log.task_id),
        "user_id": log.user_id,
        "user_name": user_name,
        "status": log.status,
        "started_at": _iso(log.started_at),
        "current_started_at": _iso(log.current_started_at),
        "ended_at": _iso(log.ended_at),
        "total_seconds": total_seconds,
        "is_manual": bool(getattr(log, "is_manual", False)),
        "source": getattr(log, "source", None) or "timer",
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
        "actor_id": notification.actor_id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "channel": notification.channel,
        "metadata": notification.metadata,
        "is_read": notification.is_read,
        "read_at": _iso(notification.read_at),
        "email_sent_at": _iso(notification.email_sent_at),
        "digest_sent_at": _iso(notification.digest_sent_at),
        "created_at": _iso(notification.created_at),
    }
