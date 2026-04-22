# Story 3.7: Atualizacao de status pelo TaskDrawerPanel com bloqueios claros

Status: done

## Story

As a Colaborador/Coordenador,  
I want atualizar status da tarefa pelo TaskDrawerPanel com feedback imediato,  
so that eu execute acoes de alta frequencia sem sair do contexto da tela principal.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`PATCH /tasks/{id}/status`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de atualizacao de status dedicado implementado.
- Regra de bloqueio com retorno claro (`task_blocked`) para dependencias impeditivas.
- Registro de atividade para mudanca de status.
- Teste de integracao cobrindo bloqueio de transicao.

### Review Findings

- [x] [Review][Approve] Retorno de bloqueio claro atende intencao de UX para TaskDrawerPanel.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
