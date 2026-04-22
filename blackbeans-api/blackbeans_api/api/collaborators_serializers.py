from __future__ import annotations

from rest_framework import serializers

from blackbeans_api.users.models import Collaborator


class CollaboratorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = (
            "display_name",
            "job_title",
            "professional_email",
            "phone",
        )
        extra_kwargs = {
            "job_title": {"required": False, "allow_blank": True, "default": ""},
            "professional_email": {"required": False, "allow_blank": True, "default": ""},
            "phone": {"required": False, "allow_blank": True, "default": ""},
        }


class CollaboratorUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = (
            "display_name",
            "job_title",
            "professional_email",
            "phone",
        )
        extra_kwargs = {
            "display_name": {"required": False},
            "job_title": {"required": False, "allow_blank": True},
            "professional_email": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
        }


class CollaboratorDepartmentLinkCreateSerializer(serializers.Serializer):
    department_id = serializers.UUIDField()
