from __future__ import annotations

from rest_framework import serializers

from blackbeans_api.governance.models import ClientContract
from blackbeans_api.governance.models import ContractServiceLine
from blackbeans_api.governance.models import ServiceCatalog


class ServiceCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCatalog
        fields = ("id", "name", "description", "is_active", "display_order", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ContractServiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractServiceLine
        fields = (
            "id",
            "service",
            "service_type",
            "recurrence",
            "recurrence_other",
            "amount",
            "starts_on",
            "ends_on",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        service_type = attrs.get("service_type", getattr(self.instance, "service_type", ContractServiceLine.ServiceType.ONE_OFF))
        recurrence = attrs.get("recurrence", getattr(self.instance, "recurrence", ""))
        starts_on = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        ends_on = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if service_type == ContractServiceLine.ServiceType.RECURRING:
            if not recurrence:
                raise serializers.ValidationError({"recurrence": "Informe a periodicidade para servico recorrente."})
            if starts_on is None:
                raise serializers.ValidationError({"starts_on": "Informe inicio de vigencia para servico recorrente."})
        if starts_on and ends_on and ends_on < starts_on:
            raise serializers.ValidationError({"ends_on": "Termino deve ser maior ou igual ao inicio."})
        return attrs


class ClientContractSerializer(serializers.ModelSerializer):
    service_lines = ContractServiceLineSerializer(many=True, write_only=True, min_length=1)

    class Meta:
        model = ClientContract
        fields = (
            "id",
            "client",
            "emits_invoice",
            "has_iss_retention",
            "has_inss_retention",
            "payment_method",
            "payment_other",
            "status",
            "notes",
            "service_lines",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def validate(self, attrs):
        payment_method = attrs.get("payment_method", getattr(self.instance, "payment_method", ClientContract.PaymentMethod.BOLETO))
        payment_other = str(attrs.get("payment_other", getattr(self.instance, "payment_other", ""))).strip()
        if payment_method == ClientContract.PaymentMethod.OTHER and not payment_other:
            raise serializers.ValidationError({"payment_other": "Descreva a forma de pagamento quando selecionar 'Outro'."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("service_lines", [])
        contract = ClientContract.objects.create(**validated_data)
        for line in lines:
            ContractServiceLine.objects.create(contract=contract, **line)
        return contract

    def update(self, instance, validated_data):
        lines = validated_data.pop("service_lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            instance.service_lines.all().delete()
            for line in lines:
                ContractServiceLine.objects.create(contract=instance, **line)
        return instance

