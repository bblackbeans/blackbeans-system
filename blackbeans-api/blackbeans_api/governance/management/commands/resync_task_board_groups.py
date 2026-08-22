from __future__ import annotations

from django.core.management.base import BaseCommand

from blackbeans_api.governance.board_status import sync_task_group_by_status
from blackbeans_api.governance.models import Task


class Command(BaseCommand):
    help = "Reagrupa tarefas nas colunas Backlog / Em andamento / Concluído conforme o status."

    def handle(self, *args, **options):
        moved = 0
        total = Task.objects.count()
        for task in Task.objects.select_related("board", "group").iterator(chunk_size=200):
            if sync_task_group_by_status(task):
                moved += 1
        self.stdout.write(self.style.SUCCESS(f"Concluido: {moved} tarefa(s) movidas de {total}."))
