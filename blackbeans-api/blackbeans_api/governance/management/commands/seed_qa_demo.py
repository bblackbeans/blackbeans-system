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


def _ensure_user(*, username: str, email: str, name: str, password: str, staff: bool = False):
    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={"email": email, "name": name},
    )
    user.email = email
    user.name = name
    user.is_staff = staff
    user.is_superuser = staff
    user.is_active = True
    user.set_password(password)
    user.save()
    return user


def _ensure_collaborator(user, *, display_name: str, job_title: str, workspace: Workspace):
    profile, _ = Collaborator.objects.get_or_create(
        professional_email=user.email,
        defaults={"display_name": display_name, "job_title": job_title},
    )
    if profile.display_name != display_name or profile.job_title != job_title:
        profile.display_name = display_name
        profile.job_title = job_title
        profile.save(update_fields=["display_name", "job_title", "updated_at"])
    UserCollaboratorLink.objects.update_or_create(
        user=user,
        collaborator=profile,
        defaults={"is_active": True},
    )
    UserWorkspaceAccess.objects.get_or_create(user=user, workspace=workspace)
    return profile


class Command(BaseCommand):
    help = "Cria usuarios e dados [QA] para homologacao local."

    def handle(self, *args, **options):
        now = timezone.now()
        # Normaliza para meio-dia e evita flutuacao por horario
        day = now.replace(hour=12, minute=0, second=0, microsecond=0)

        admin = _ensure_user(
            username="admin.teste",
            email="admin.teste@blackbeans.local",
            name="Admin Teste",
            password="Admin!Teste2025#",
            staff=True,
        )
        colab = _ensure_user(
            username="colaborador_demo",
            email="colaborador.demo@blackbeans.local",
            name="Colaborador Demo",
            password="Colab!Demo2025#",
        )
        barbara = _ensure_user(
            username="barbara.thimoteo",
            email="barbara.thimoteo@blackbeans.local",
            name="Barbara Thimoteo",
            password="Colab!Demo2025#",
        )
        felipe = _ensure_user(
            username="felipe.santos",
            email="felipe.santos@blackbeans.local",
            name="Felipe Santos",
            password="Colab!Demo2025#",
        )
        kaue = _ensure_user(
            username="kaue.ronald",
            email="kaue.ronald@blackbeans.local",
            name="Kaue Ronald",
            password="Colab!Demo2025#",
        )
        marina = _ensure_user(
            username="marina.oliveira",
            email="marina.oliveira@blackbeans.local",
            name="Marina Oliveira",
            password="Colab!Demo2025#",
        )

        ws, _ = Workspace.objects.get_or_create(name="Produção")
        Workspace.objects.get_or_create(name="Producao")

        _ensure_collaborator(colab, display_name="Colaborador Demo", job_title="Designer", workspace=ws)
        _ensure_collaborator(barbara, display_name="Barbara Thimoteo", job_title="PM", workspace=ws)
        _ensure_collaborator(felipe, display_name="Felipe Santos", job_title="Dev", workspace=ws)
        _ensure_collaborator(kaue, display_name="Kaue Ronald", job_title="Dev", workspace=ws)
        _ensure_collaborator(marina, display_name="Marina Oliveira", job_title="QA", workspace=ws)
        UserWorkspaceAccess.objects.get_or_create(user=admin, workspace=ws)

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
                "start_date": day - timedelta(days=7),
                "end_date": day + timedelta(days=30),
            },
        )
        if project.client_id != client.id:
            project.client = client
            project.save(update_fields=["client", "updated_at"])

        board, _ = Board.objects.get_or_create(project=project, name="Board Demo")
        group_todo, _ = BoardGroup.objects.get_or_create(
            board=board,
            position=1,
            defaults={"name": "A fazer", "wip_limit": 40},
        )
        group_doing, _ = BoardGroup.objects.get_or_create(
            board=board,
            position=2,
            defaults={"name": "Em andamento", "wip_limit": 20},
        )
        group_done, _ = BoardGroup.objects.get_or_create(
            board=board,
            position=3,
            defaults={"name": "Concluido", "wip_limit": 80},
        )

        Task.objects.filter(title__startswith="[QA]").delete()
        ClientRequest.objects.filter(title__startswith="[QA]").delete()

        def create_task(
            *,
            title: str,
            description: str,
            status: str,
            priority: str,
            assignee,
            effort: int,
            start_offset: int,
            end_offset: int,
            group=None,
            parent=None,
            is_recurring: bool = False,
            recurrence_frequency: str = "",
        ):
            if group is None:
                if status == Task.Status.DONE:
                    group = group_done
                elif status == Task.Status.IN_PROGRESS:
                    group = group_doing
                else:
                    group = group_todo
            return Task.objects.create(
                board=board,
                group=group,
                parent=parent,
                title=title,
                description=description,
                status=status,
                priority=priority,
                assignee=assignee,
                effort_points=effort,
                start_date=day + timedelta(days=start_offset),
                end_date=day + timedelta(days=end_offset),
                is_recurring=is_recurring,
                recurrence_frequency=recurrence_frequency,
            )

        specs = [
            # Concluidas (passado)
            dict(
                title="[QA] Kickoff com cliente Demo",
                description="Reuniao inicial — ja finalizada.",
                status=Task.Status.DONE,
                priority=Task.Priority.MEDIUM,
                assignee=barbara,
                effort=2,
                start_offset=-20,
                end_offset=-18,
            ),
            dict(
                title="[QA] Setup ambiente de homologacao",
                description="Infra basica liberada.",
                status=Task.Status.DONE,
                priority=Task.Priority.HIGH,
                assignee=kaue,
                effort=5,
                start_offset=-16,
                end_offset=-12,
            ),
            dict(
                title="[QA] Wireframe landing page",
                description="Aprovado pelo cliente.",
                status=Task.Status.DONE,
                priority=Task.Priority.MEDIUM,
                assignee=colab,
                effort=4,
                start_offset=-14,
                end_offset=-10,
            ),
            dict(
                title="[QA] Checklist QA release 0.1",
                description="Smoke tests ok.",
                status=Task.Status.DONE,
                priority=Task.Priority.LOW,
                assignee=marina,
                effort=3,
                start_offset=-9,
                end_offset=-7,
            ),
            dict(
                title="[QA] Tarefa concluida",
                description="Para dashboard de horas e filtros done.",
                status=Task.Status.DONE,
                priority=Task.Priority.LOW,
                assignee=colab,
                effort=2,
                start_offset=-5,
                end_offset=-4,
            ),
            # Em andamento (variados)
            dict(
                title="[QA] Campanha Instagram — briefing",
                description="Descricao com link https://example.com/briefing e mencao @barbara.thimoteo",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.HIGH,
                assignee=barbara,
                effort=4,
                start_offset=-3,
                end_offset=2,
            ),
            dict(
                title="[QA] Produzir artes (recorrente)",
                description="Tarefa recorrente semanal para testar spawn ao concluir.",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.MEDIUM,
                assignee=colab,
                effort=8,
                start_offset=-2,
                end_offset=5,
                is_recurring=True,
                recurrence_frequency="weekly",
            ),
            dict(
                title="[QA] Integracao API check-in",
                description="PUT/update no fluxo de check-in — @felipe.santos",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.HIGH,
                assignee=felipe,
                effort=6,
                start_offset=-1,
                end_offset=4,
            ),
            dict(
                title="[QA] Ajuste layout etiquetas",
                description="Deploy pendente no sistema local.",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.MEDIUM,
                assignee=kaue,
                effort=3,
                start_offset=0,
                end_offset=3,
            ),
            dict(
                title="[QA] Suite regressao sprint atual",
                description="Casos criticos de login e tarefas.",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.HIGH,
                assignee=marina,
                effort=5,
                start_offset=-4,
                end_offset=1,
            ),
            dict(
                title="[QA] Revisao cliente (depende do briefing)",
                description="Depende do briefing — teste de cascata de prazo.",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.MEDIUM,
                assignee=admin,
                effort=3,
                start_offset=1,
                end_offset=6,
            ),
            # A fazer / futuro
            dict(
                title="[QA] Publicar landing v2",
                description="Aguardando artes finais.",
                status=Task.Status.TODO,
                priority=Task.Priority.MEDIUM,
                assignee=colab,
                effort=4,
                start_offset=3,
                end_offset=10,
            ),
            dict(
                title="[QA] Treinamento do time no portal",
                description="Sessao com o cliente.",
                status=Task.Status.TODO,
                priority=Task.Priority.LOW,
                assignee=barbara,
                effort=2,
                start_offset=7,
                end_offset=8,
            ),
            dict(
                title="[QA] Relatorio mensal de horas",
                description="Exportar e validar com financeiro.",
                status=Task.Status.TODO,
                priority=Task.Priority.MEDIUM,
                assignee=marina,
                effort=2,
                start_offset=5,
                end_offset=12,
            ),
            dict(
                title="[QA] Refino performance listagens",
                description="Tabelas Meu trabalho e projeto.",
                status=Task.Status.TODO,
                priority=Task.Priority.HIGH,
                assignee=kaue,
                effort=5,
                start_offset=2,
                end_offset=9,
            ),
            dict(
                title="[QA] Documentar webhooks do check-in",
                description="Markdown interno + exemplos.",
                status=Task.Status.TODO,
                priority=Task.Priority.LOW,
                assignee=felipe,
                effort=3,
                start_offset=4,
                end_offset=11,
            ),
            # Bloqueadas / atrasadas
            dict(
                title="[QA] Tarefa atrasada",
                description="Para filtros overdue / agente.",
                status=Task.Status.BLOCKED,
                priority=Task.Priority.HIGH,
                assignee=colab,
                effort=2,
                start_offset=-10,
                end_offset=-2,
            ),
            dict(
                title="[QA] Acesso VPN do cliente",
                description="Aguardando liberacao de rede.",
                status=Task.Status.BLOCKED,
                priority=Task.Priority.CRITICAL,
                assignee=felipe,
                effort=1,
                start_offset=-6,
                end_offset=-1,
            ),
            dict(
                title="[QA] Homologacao facial #2475",
                description="Problema reconhecimento facial — depends do token.",
                status=Task.Status.BLOCKED,
                priority=Task.Priority.HIGH,
                assignee=kaue,
                effort=4,
                start_offset=-3,
                end_offset=0,
            ),
            # Sem prazo / prazos longos
            dict(
                title="[QA] Backlog: ideias de automacao",
                description="Sem prazo definido — deve ir ao fim da ordenacao.",
                status=Task.Status.TODO,
                priority=Task.Priority.LOW,
                assignee=barbara,
                effort=1,
                start_offset=0,
                end_offset=45,
            ),
            dict(
                title="[QA] Planejamento Q4 campanhas",
                description="Prazo longo para ordenacao.",
                status=Task.Status.TODO,
                priority=Task.Priority.MEDIUM,
                assignee=admin,
                effort=6,
                start_offset=20,
                end_offset=40,
            ),
            dict(
                title="[QA] Vencendo hoje — priorizar",
                description="End date = hoje para testar urgencia.",
                status=Task.Status.IN_PROGRESS,
                priority=Task.Priority.CRITICAL,
                assignee=marina,
                effort=2,
                start_offset=-2,
                end_offset=0,
            ),
            dict(
                title="[QA] Venceu ontem — follow-up",
                description="Um dia atrasada.",
                status=Task.Status.TODO,
                priority=Task.Priority.HIGH,
                assignee=felipe,
                effort=2,
                start_offset=-5,
                end_offset=-1,
            ),
        ]

        created: dict[str, Task] = {}
        for spec in specs:
            task = create_task(**spec)
            created[spec["title"]] = task

        briefing = created["[QA] Campanha Instagram — briefing"]
        review = created["[QA] Revisao cliente (depende do briefing)"]
        TaskDependency.objects.get_or_create(task=review, depends_on=briefing)

        create_task(
            title="[QA] Subtarefa: coletar referencias",
            description="Subtarefa visivel nas listagens.",
            status=Task.Status.TODO,
            priority=Task.Priority.LOW,
            assignee=colab,
            effort=1,
            start_offset=0,
            end_offset=1,
            parent=briefing,
            group=group_doing,
        )
        create_task(
            title="[QA] Subtarefa: validar copy",
            description="Copy da campanha Instagram.",
            status=Task.Status.IN_PROGRESS,
            priority=Task.Priority.MEDIUM,
            assignee=barbara,
            effort=1,
            start_offset=-1,
            end_offset=2,
            parent=briefing,
            group=group_doing,
        )
        create_task(
            title="[QA] Subtarefa: casos de borda API",
            description="Cenarios 4xx/5xx no check-in.",
            status=Task.Status.TODO,
            priority=Task.Priority.HIGH,
            assignee=marina,
            effort=2,
            start_offset=0,
            end_offset=3,
            parent=created["[QA] Integracao API check-in"],
            group=group_doing,
        )

        # Horas apontadas (consumidas) em tarefas variadas
        time_samples = [
            (created["[QA] Produzir artes (recorrente)"], colab, 3, 1, 7200),
            (briefing, barbara, 5, 4, 3600),
            (created["[QA] Tarefa concluida"], admin, 4 * 24 + 2, 4 * 24, 5400),
            (created["[QA] Setup ambiente de homologacao"], kaue, 13 * 24, 12 * 24 + 20, 10800),
            (created["[QA] Integracao API check-in"], felipe, 2, 1, 5400),
            (created["[QA] Suite regressao sprint atual"], marina, 6, 4, 7200),
            (created["[QA] Ajuste layout etiquetas"], kaue, 8, 6, 3600),
            (created["[QA] Wireframe landing page"], colab, 12 * 24, 11 * 24, 9000),
            (review, admin, 10, 8, 3600),
        ]
        for task, user, hours_ago_start, hours_ago_end, seconds in time_samples:
            TimeLog.objects.create(
                task=task,
                user=user,
                status=TimeLog.Status.COMPLETED,
                started_at=now - timedelta(hours=hours_ago_start),
                ended_at=now - timedelta(hours=hours_ago_end),
                accumulated_seconds=seconds,
                is_manual=False,
                source="timer",
            )

        TaskComment.objects.create(
            task=briefing,
            author=admin,
            content="Comentario de teste com link https://blackbeans.com.br e @barbara.thimoteo",
        )
        TaskComment.objects.create(
            task=created["[QA] Integracao API check-in"],
            author=barbara,
            content="@felipe.santos o PUT/update ainda retorna 500 no check-in. Pode olhar hoje?",
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

        qa_count = Task.objects.filter(title__startswith="[QA]").count()
        by_status = {
            status: Task.objects.filter(title__startswith="[QA]", status=status).count()
            for status, _ in Task.Status.choices
        }
        self.stdout.write(self.style.SUCCESS("Seed QA concluido."))
        self.stdout.write("- admin: admin.teste / Admin!Teste2025#")
        self.stdout.write("- colabs (senha Colab!Demo2025#):")
        self.stdout.write("  colaborador_demo, barbara.thimoteo, felipe.santos, kaue.ronald, marina.oliveira")
        self.stdout.write(f"- project: {project.name} ({project.pk})")
        self.stdout.write(f"- tasks [QA]: {qa_count} | por status: {by_status}")
        self.stdout.write(f"- pedidos [QA]: {ClientRequest.objects.filter(title__startswith='[QA]').count()}")
        self.stdout.write("- formulario publico: /pedido")
