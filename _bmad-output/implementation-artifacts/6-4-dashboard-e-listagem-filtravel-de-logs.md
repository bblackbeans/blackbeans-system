# Story 6.4: Dashboard e listagem filtravel de logs

Status: done

## Story

As a Superusuario,  
I want visualizar dashboard de logs e listar eventos com filtros,  
so that eu investigue incidentes e acompanhe saude operacional.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /audit/dashboard` e `GET /audit/logs`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint `GET /api/v1/audit/dashboard` com volume por tipo, falhas e recorte 24h.
- Endpoint `GET /api/v1/audit/logs` com filtros (ator, tipo, escopo, período) e paginação.
- Acesso restrito a superusuário.
- Teste de integração para dashboard e listagem filtrada.

### Review Findings

- [x] [Review][Patch] Paginação e filtros completos para investigação operacional.
- [x] [Review][Approve] Dashboard entrega indicadores mínimos previstos.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
