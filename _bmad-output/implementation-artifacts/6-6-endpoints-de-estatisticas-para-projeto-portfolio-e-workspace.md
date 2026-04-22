# Story 6.6: Endpoints de estatisticas para projeto, portfolio e workspace

Status: done

## Story

As a Gestor/Coordenador,  
I want consultar estatisticas consolidadas por niveis da hierarquia,  
so that eu faca analise gerencial com base confiavel de dados.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /workspaces/{id}/stats`, `GET /portfolios/{id}/stats`, `GET /projects/{id}/stats`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoints de estatísticas por escopo implementados para workspace/portfolio/project.
- Métricas incluem contagens de projetos/tarefas e progresso por projeto.
- Restrições de autorização e isolamento por escopo mantidas no padrão existente.
- Teste de integração cobrindo retorno consistente dos três endpoints.

### Review Findings

- [x] [Review][Patch] Garantido padrão de retorno e consistência de métricas entre níveis.
- [x] [Review][Approve] AC de análise consolidada atendido.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
