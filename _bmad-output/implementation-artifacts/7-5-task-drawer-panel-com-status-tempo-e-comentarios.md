# Story 7.5: Task Drawer Panel com status, tempo e comentarios

Status: done

## Story

As a Usuario operacional,
I want operar a tarefa no drawer (status, tempo e comentarios),
so that eu mantenha execucao e contexto no mesmo fluxo.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (drawer com tabs de tempo/historico + acoes de tarefa).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Drawer integrado a `/tasks/{id}/activity` e `/tasks/{id}/time-summary`.
- Acoes conectadas: `time/start`, `time/pause`, `time/resume`, `complete`, `status`, `comments`.
- Feedback em tempo real apos acao e recarga dos dados da tarefa.

### Review Findings

- [x] [Review][Patch] Ajustado recarregamento apos acao para manter estado consistente no drawer.
- [x] [Review][Approve] Fluxo central de tarefa entregue conforme UX drawer-first.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
