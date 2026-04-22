# Story 4.3: Editar e excluir logs de sessao de tempo

Status: done

## Story

As a Usuario autorizado,  
I want editar e excluir logs de sessao quando necessario,  
so that eu corrija apontamentos incorretos mantendo integridade de auditoria.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`PATCH|DELETE /time-logs/{id}`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de edicao com validacao de consistencia temporal (`inicio < fim`).
- Recalculo de `total_seconds` quando periodo fechado e atualizado.
- Exclusao logica por status `deleted`, preservando trilha de auditoria.
- Eventos de atividade de tarefa adicionados para edicao/exclusao de tempo.
- Teste de integracao cobrindo patch valido e delete logico.

### Review Findings

- [x] [Review][Patch] Manter historico via soft delete em vez de remocao fisica.
- [x] [Review][Approve] Validacoes de integridade do apontamento implementadas.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
