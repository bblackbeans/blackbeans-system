# Story 7.6: Central de notificacoes e contador nao lido

Status: done

## Story

As a Usuario autenticado,
I want visualizar notificacoes e contador de nao lidas,
so that eu priorize alertas operacionais com rapidez.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`/notifications`, `/notifications/{id}/read`, `/notifications/unread-count`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Lista de notificacoes conectada ao endpoint paginado `/notifications`.
- Marcacao de leitura integrada ao endpoint dedicado.
- Badge de nao lidas visivel no header com atualizacao por recarga de modulo.

### Review Findings

- [x] [Review][Patch] Refinada acao de leitura para atualizar lista e contador no frontend.
- [x] [Review][Approve] Fluxo de notificacoes integrado ponta a ponta.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
