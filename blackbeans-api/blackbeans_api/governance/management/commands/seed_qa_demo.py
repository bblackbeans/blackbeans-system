"""Seed local QA data for testing A/B/C. Idempotent by [QA] title prefix."""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.models import Board
from blackbeans_api.governance.models import BoardGroup
from blackbeans_api.governance.models import ClientRequest
from blackbeans_api.governance.models import Portfolio
from blackbeans_api.governance.models import Project
from blackbeans_api.governance.models import Task
from blackbeans_api.governance.models import TaskComment
from blackbeans_api.governance.models import TaskDependency
from blackbeans_api.governance.models import TimeLog
from blackbeans_api.governance.models import Workspace
from blackbeans_api.users.models import Collaborator
from blackbeans_api.users.models import UserCollaboratorLink
from blackbeans_api.users.models import UserWorkspaceAccess


class Command(BaseCommand):
    help = "Cria usuarios e dados [QA] para homologacao local."

    def handle(self, *args, **options):
        User = get_user_model()
        now = timezone.now()

        admin, _ = User.objects.get_or_create(
            username="admin.teste",
            defaults={"email": "admin.teste@blackbeans.local", "name": "Admin Teste"},
        )
        admin.email = "admin.teste@blackbeans.local"
        admin.name = "Admin Teste"
        admin.is_staff = True
        admin.is_superuser = True
        admin.is_active = True
        admin.set_password("Admin!Teste2025#")
        admin.save()

        colab, _ = User.objects.get_or_create(
            username="colaborador_demo",
            defaults={"email": "colaborador.demo@blackbeans.local", "name": "Colaborador Demo"},
        )
        colab.email = "colaborador.demo@blackbeans.local"
        colab.name = "Colaborador Demo"
        colab.is_staff = False
        colab.is_superuser = False
        colab.is_active = True
        colab.set_password("Colab!Demo2025#")
        colab.save()

        collab_profile, _ = Collaborator.objects.get_or_create(
            professional_email="colaborador.demo@blackbeans.local",
            defaults={"display_name": "Colaborador Demo", "job_title": "Designer"},
        )
        UserCollaboratorLink.objects.update_or_create(
            user=colab,
            collaborator=collab_profile,
            defaults={"is_active": True},
        )

        ws, _ = Workspace.objects.get_or_create(name="Produção")
        Workspace.objects.get_or_create(name="Producao")
        UserWorkspaceAccess.objects.get_or_create(user=colab, workspace=ws)

        client, _ = Client.objects.get_or_create(
            cnpj="12.345.678/0001-90",
            defaults={
                "name": "Cliente Demo QA",
                "contact_name": "Ana Contato",
                "financial_emails": "financeiro@cliente-demo.local",
                "status": Client.Status.ACTIVE,
                "description": "Cliente para testes A/B/C",
            },
        )

        portfolio, _ = Portfolio.objects.get_or_create(
            workspace=ws,
            name="Cliente Demo QA",
            defaults={"description": "Portfolio de testes"},
        )

        project, _ = Project.objects.get_or_create(
            portfolio=portfolio,
            name="Projeto Demo QA",
            defaults={
                "client": client,
                "description": "Projeto com tarefas de teste",
                "status": Project.Status.ACTIVE,
                "start_date": now - timedelta(days=7),
                "end_date": now + timedelta(days=30),
            },
        )
        if project.client_id != client.id:
            project.client = client
            project.save(update_fields=["client", "updated_at"])

        board, _ = Board.objects.get_or_create(project=project, name="Board Demo")
        group, _ = BoardGroup.objects.get_or_create(
            board=board,
            position=1,
            defaults={"name": "A fazer", "wip_limit": 20},
        )
        BoardGroup.objects.get_or_create(board=board, position=2, defaults={"name": "Em andamento", "wip_limit": 10})
        BoardGroup.objects.get_or_create(board=board, position=3, defaults={"name": "Concluido", "wip_limit": 50})

        Task.objects.filter(title__startswith="[QA]").delete()
        ClientRequest.objects.filter(title__startswith="[QA]").delete()

        t1 = Task.objects.create(
            board=board,
            group=group,
            title="[QA] Campanha Instagram — briefing",
            description="Descricao com link https://example.com/briefing e mencao @colaborador_demo",
            status=Task.Status.TODO,
            priority=Task.Priority.HIGH,
            assignee=colab,
            effort_points=4,
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=3),
        )
        t2 = Task.objects.create(
            board=board,
            group=group,
            title="[QA] Produzir artes (recorrente)",
            description="Tarefa recorrente semanal para testar spawn ao concluir.",
            status=Task.Status.IN_PROGRESS,
            priority=Task.Priority.MEDIUM,
            assignee=colab,
            effort_points=8,
            start_date=now - timedelta(days=2),
            end_date=now + timedelta(days=5),
            is_recurring=True,
            recurrence_frequency="weekly",
        )
        t3 = Task.objects.create(
            board=board,
            group=group,
            title="[QA] Revisao cliente (depende do briefing)",
            description="Depende da tarefa 1 — teste de cascata de prazo.",
            status=Task.Status.TODO,
            priority=Task.Priority.MEDIUM,
            assignee=admin,
            effort_points=3,
            start_date=now + timedelta(days=3),
            end_date=now + timedelta(days=6),
        )
        TaskDependency.objects.get_or_create(task=t3, depends_on=t1)

        Task.objects.create(
            board=board,
            group=group,
            parent=t1,
            title="[QA] Subtarefa: coletar referencias",
            description="Subtarefa visivel nas listagens.",
            status=Task.Status.TODO,
            priority=Task.Priority.LOW,
            assignee=colab,
            effort_points=1,
            start_date=now,
            end_date=now + timedelta(days=1),
        )

        Task.objects.create(
            board=board,
            group=group,
            title="[QA] Tarefa atrasada",
            description="Para filtros overdue / agente.",
            status=Task.Status.BLOCKED,
            priority=Task.Priority.HIGH,
            assignee=colab,
            effort_points=2,
            start_date=now - timedelta(days=10),
            end_date=now - timedelta(days=2),
        )

        t5 = Task.objects.create(
            board=board,
            group=group,
            title="[QA] Tarefa concluida",
            description="Para dashboard de horas e filtros done.",
            status=Task.Status.DONE,
            priority=Task.Priority.LOW,
            assignee=colab,
            effort_points=2,
            start_date=now - timedelta(days=5),
            end_date=now - timedelta(days=4),
        )

        TimeLog.objects.create(
            task=t2,
            user=colab,
            status=TimeLog.Status.COMPLETED,
            started_at=now - timedelta(hours=3),
            ended_at=now - timedelta(hours=1),
            accumulated_seconds=7200,
            is_manual=False,
            source="timer",
        )
        TimeLog.objects.create(
            task=t1,
            user=colab,
            status=TimeLog.Status.COMPLETED,
            started_at=now - timedelta(hours=5),
            ended_at=now - timedelta(hours=4),
            accumulated_seconds=3600,
            is_manual=True,
            source="manual",
        )
        TimeLog.objects.create(
            task=t5,
            user=admin,
            status=TimeLog.Status.COMPLETED,
            started_at=now - timedelta(days=4, hours=2),
            ended_at=now - timedelta(days=4),
            accumulated_seconds=5400,
            is_manual=False,
            source="timer",
        )

        TaskComment.objects.create(
            task=t1,
            author=admin,
            content="Comentario de teste com link https://blackbeans.com.br e @colaborador_demo",
        )

        ClientRequest.objects.create(
            client_name="Cliente Demo QA",
            contact_name="Ana Contato",
            contact_email="ana@cliente-demo.local",
            contact_phone="11999990000",
            title="[QA] Pedido: nova landing page",
            description="Gostariamos de uma landing para campanha de abril.",
            status=ClientRequest.Status.NEW,
        )
        ClientRequest.objects.create(
            client_name="Acme Brasil",
            contact_name="Bruno",
            contact_email="bruno@acme.local",
            title="[QA] Pedido: ajuste de banner",
            description="Trocar arte do banner principal.",
            status=ClientRequest.Status.NEW,
        )

        self.stdout.write(self.style.SUCCESS("Seed QA concluido."))
        self.stdout.write(f"- admin: admin.teste / admin.teste@blackbeans.local / Admin!Teste2025#")
        self.stdout.write(f"- colab: colaborador_demo / colaborador.demo@blackbeans.local / Colab!Demo2025#")
        self.stdout.write(f"- project: {project.name} ({project.pk})")
        self.stdout.write(f"- tasks [QA]: {Task.objects.filter(title__startswith='[QA]').count()}")
        self.stdout.write(f"- pedidos [QA]: {ClientRequest.objects.filter(title__startswith='[QA]').count()}")
        self.stdout.write("- formulario publico: /pedido")
