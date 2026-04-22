# Story 3.1: Criacao de board vinculado ao projeto

Status: done

## Story

As a Gestor,  
I want criar boards vinculados a um projeto,  
so that eu organize o fluxo operacional de execucao por contexto de entrega.

## Acceptance Criteria

- `POST /api/v1/boards` com `project_id` valido retorna `201` com board criado e associado ao projeto/workspace.
- `project_id` invalido ou fora de escopo retorna erro padronizado com `correlation_id`.

## Tasks / Subtasks

- [x] Create-story: contexto e contrato de endpoint definidos.
- [x] Dev-story: implementar endpoint de criacao de board.
- [x] Dev-story: criar testes de integracao para sucesso e erro.
- [x] Code-review: revisar contra ACs e registrar findings.

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run pytest tests/integration/test_epic2_operations_api.py::test_story_3_1_create_board_linked_to_project tests/integration/test_epic2_operations_api.py::test_story_3_1_create_board_invalid_project_returns_400 -q`

### Completion Notes List

- Endpoint `POST /api/v1/boards` implementado com `project_id` valido.
- Validacao de `project_id` invalido retorna `validation_error` (400) com envelope padronizado.
- Testes da story 3.1 criados e aprovados.

### Review Findings

- [x] [Review][Approve] Criacao de board vinculada ao projeto atende os ACs da story.
- [x] [Review][Approve] Erro para projeto invalido segue contrato padronizado da API.

### File List

- `_bmad-output/implementation-artifacts/3-1-criacao-de-board-vinculado-ao-projeto.md`
- `blackbeans-api/blackbeans_api/api/operations_serializers.py`
- `blackbeans-api/blackbeans_api/api/operations_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/tests/integration/test_epic2_operations_api.py`

### Change Log

- 2026-04-20: story criada (etapa create-story).
- 2026-04-20: story implementada e revisada no fluxo estrito BMAD (dev-story + code-review).
