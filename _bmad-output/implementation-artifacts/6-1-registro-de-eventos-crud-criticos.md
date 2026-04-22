# Story 6.1: Registro de eventos CRUD criticos

Status: done

## Story

As a Superusuario,  
I want que eventos CRUD criticos sejam registrados automaticamente,  
so that eu tenha trilha confiavel para investigacao e compliance operacional.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (modelo `AuditLog` + auditoria de CRUD critico).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `AuditLog` criado com `actor_id`, `workspace_id`, `before`, `after` e `correlation_id`.
- Serviço `log_audit_event` adicionado para padronizar escrita de auditoria.
- CRUD de workspace conectado com eventos `created`, `updated`, `deleted`.
- Teste de integração cobrindo criação/edição/exclusão e logs correspondentes.

### Review Findings

- [x] [Review][Patch] Exclusão de workspace auditada sem manter FK inválida para entidade removida.
- [x] [Review][Approve] Trilha mínima before/after atendida.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
