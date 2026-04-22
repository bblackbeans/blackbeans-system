# Story 7.16: Kanban drag-and-drop e eliminacao de prompts nativos

Status: done

## Story

As a Usuario web,
I want mover tarefas por drag-and-drop e executar acoes criticas em modais padronizados,
so that o fluxo operacional fique moderno e consistente.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (DnD no Kanban + modais para 2FA/edicao/exclusao).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Adicionado drag-and-drop no Kanban com atualizacao via API.
- Substituidos todos os `prompt/confirm/alert` nativos por modais Ant Design.
- Setup de 2FA passou a abrir modal com QR Code e confirmacao de codigo.
- Removidos warnings de componentes deprecados em Drawer/Space/List/Alert.

### Review Findings

- [x] [Review][Patch] Garantido fallback de erro em modais com feedback de API.
- [x] [Review][Patch] Validado lint e build apos refatoracao de UI.
- [x] [Review][Approve] Fluxo operacional principal estabilizado para homologacao.

### Change Log

- 2026-04-21: ciclo BMAD completo (create/dev/review).
