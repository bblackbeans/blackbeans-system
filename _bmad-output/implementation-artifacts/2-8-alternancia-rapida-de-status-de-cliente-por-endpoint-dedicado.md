# Story 2.8: Alternancia rapida de status de cliente por endpoint dedicado

Status: done

## Story

As a Gestor,  
I want alternar rapidamente o status do cliente (ativo/inativo),  
so that eu execute mudancas operacionais sem atrito e com rastreabilidade.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /clients/{id}/status-toggle`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint dedicado de alternancia de status implementado.
- Evento de log com antes/depois e `actor_id` adicionado.
- Teste de integracao: `test_story_2_8_client_status_toggle`.

### Review Findings

- [x] [Review][Approve] Endpoint dedicado de alternancia atende AC de troca `active/inactive`.
- [x] [Review][Approve] Log de antes/depois com `actor_id` e `correlation_id` preserva rastreabilidade.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
- 2026-04-20: reexecucao estrita BMAD confirmada com teste dedicado da story.
