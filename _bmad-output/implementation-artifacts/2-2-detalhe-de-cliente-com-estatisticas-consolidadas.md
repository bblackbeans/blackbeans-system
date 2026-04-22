# Story 2.2: Detalhe de cliente com estatisticas consolidadas

Status: done

## Story

As a Gestor,  
I want visualizar detalhes e estatisticas consolidadas de um cliente,  
so that eu acompanhe saude operacional e evolucao de entregas por conta.

## Acceptance Criteria

- `GET /api/v1/clients/{client_id}` retorna cliente + estatisticas consolidadas.
- `client_id` inexistente retorna erro padronizado com `correlation_id`.

## Tasks / Subtasks

- [x] Create-story: contexto e contrato definidos.
- [x] Dev-story: endpoint de detalhe com estatisticas implementado.
- [x] Code-review: validado com testes de integracao.

## Dev Agent Record

### Completion Notes List

- Endpoint `GET /api/v1/clients/{client_id}` implementado em `clients_views.py`.
- Estatisticas adicionadas: workspaces, portfolios, projetos, projetos concluidos e em risco.
- Teste de integracao: `test_story_2_2_client_detail_with_stats`.

### Review Findings

- [x] [Review][Approve] Contrato de detalhe de cliente atende ACs de retorno de dados base + estatisticas consolidadas.
- [x] [Review][Approve] Cenarios de erro para cliente inexistente permanecem alinhados ao envelope padronizado.

### Change Log

- 2026-04-20: story criada (`bmad-create-story`), implementada (`bmad-dev-story`) e revisada (`bmad-code-review`).
- 2026-04-20: reexecucao estrita BMAD (create/dev/review) validada por teste dedicado da story.
