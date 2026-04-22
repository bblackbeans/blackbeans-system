# Story 3.2: Gestao de grupos no board (criar, editar, excluir, reordenar e WIP)

Status: done

## Story

As a Gestor,  
I want manter grupos dentro do board e definir ordem e WIP por grupo,  
so that eu controle o fluxo de trabalho e limites de execucao simultanea.

## Acceptance Criteria

- `POST /api/v1/boards/{board_id}/groups` cria grupo e define posicao coerente.
- `PATCH /api/v1/groups/{group_id}` atualiza nome, ordem e `wip_limit`.
- Reordenacao deve manter sequencia consistente.
- `wip_limit` invalido retorna erro padronizado.

## Tasks / Subtasks

- [x] Create-story: contrato e contexto da story definidos.
- [x] Dev-story: modelar entidade de grupo no board.
- [x] Dev-story: implementar endpoints de criacao/edicao/reordenacao.
- [x] Dev-story: criar testes de integracao para fluxo feliz e validacao.
- [x] Code-review: revisar aderencia aos ACs e registrar findings.

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run python manage.py makemigrations governance`
- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run python manage.py migrate --noinput`
- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run pytest tests/integration/test_epic2_operations_api.py::test_story_3_2_create_group_and_default_position tests/integration/test_epic2_operations_api.py::test_story_3_2_update_group_wip_and_position tests/integration/test_epic2_operations_api.py::test_story_3_2_invalid_wip_returns_400 -q`

### Completion Notes List

- Modelo `BoardGroup` criado com `position` e `wip_limit`.
- Endpoint `POST /api/v1/boards/{board_id}/groups` implementado com posicao inicial coerente.
- Endpoint `PATCH /api/v1/groups/{group_id}` implementado com suporte a reordenacao e validacao de `wip_limit`.
- Testes de integracao cobrindo criacao, reordenacao e erro de `wip_limit` invalido.

### Review Findings

- [x] [Review][Approve] Criacao e edicao de grupos atendem os ACs principais da story.
- [x] [Review][Approve] Reordenacao mantem sequencia consistente dentro do board.
- [x] [Review][Approve] Validacao de `wip_limit` invalido retorna `validation_error`.

### File List

- `_bmad-output/implementation-artifacts/3-2-gestao-de-grupos-no-board-criar-editar-excluir-reordenar-e-wip.md`
- `blackbeans-api/blackbeans_api/governance/models.py`
- `blackbeans-api/blackbeans_api/governance/migrations/0004_boardgroup.py`
- `blackbeans-api/blackbeans_api/api/operations_serializers.py`
- `blackbeans-api/blackbeans_api/api/operations_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/tests/integration/test_epic2_operations_api.py`

### Change Log

- 2026-04-20: story criada (etapa create-story).
- 2026-04-20: story implementada e revisada no fluxo estrito BMAD (dev-story + code-review).
