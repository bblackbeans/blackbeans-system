# Story 7.9: Telas de estatisticas por workspace, portfolio e projeto

Status: done

## Story

As a Gestor/Coordenador,
I want consultar estatisticas por escopo no frontend,
so that eu acompanhe desempenho operacional em diferentes niveis.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (formularios e chamadas para stats por escopo).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Interface com tres consultas: workspace, portfolio e project.
- Integracao com endpoints `/workspaces/{id}/stats`, `/portfolios/{id}/stats`, `/projects/{id}/stats`.
- Resultado unificado em painel JSON para leitura inicial e debug operacional.

### Review Findings

- [x] [Review][Patch] Ajustado tratamento de erro por consulta com feedback ao usuario.
- [x] [Review][Approve] Stats por escopo integrados na camada web.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
