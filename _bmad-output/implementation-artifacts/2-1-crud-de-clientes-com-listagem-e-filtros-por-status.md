# Story 2.1: CRUD de clientes com listagem e filtros por status

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Gestor,  
I want criar, editar, inativar e listar clientes com filtros operacionais,  
so that eu mantenha a base de clientes organizada para planejamento da operacao.

## Acceptance Criteria

1. **Given** um gestor autenticado e autorizado  
   **When** ele fizer `POST /api/v1/clients` com dados validos  
   **Then** a API deve retornar `201` com cliente criado em envelope de sucesso  
   **And** o cliente deve iniciar com status valido conforme regra de dominio.

2. **Given** clientes existentes  
   **When** o gestor fizer `GET /api/v1/clients?status=active&search={term}`  
   **Then** a API deve retornar `200` com lista paginada  
   **And** aplicar filtros por status e termo de busca de forma combinada.

3. **Given** um cliente existente  
   **When** o gestor fizer `PATCH /api/v1/clients/{client_id}` com alteracoes validas  
   **Then** a API deve retornar `200` com dados atualizados  
   **And** manter consistencia de campos obrigatorios e validacoes de negocio.

## Tasks / Subtasks

- [x] Modelagem de cliente no dominio (AC: 1, 2, 3)
  - [x] Criar modelo `Client` com `id` UUID, `name`, `status` (`active`/`inactive`), `description` opcional e timestamps.
  - [x] Adicionar constraints e indexes para consulta por `status` e busca por nome.
  - [x] Registrar app/modelo na configuracao de projeto e gerar migracao.
- [x] API `POST /api/v1/clients` (AC: 1)
  - [x] Implementar serializer de criacao com validacao de campos obrigatorios.
  - [x] Responder envelope padrao com `data.client` e `X-Correlation-ID`.
  - [x] Logar evento `crm.client.created` com `actor_id` e `correlation_id`.
- [x] API `GET /api/v1/clients` com filtros e paginacao (AC: 2)
  - [x] Implementar query params `status`, `search`, `page`, `page_size`.
  - [x] Aplicar filtros combinados (status + termo) com busca em `name`.
  - [x] Retornar metadados de paginacao em `meta` (`total`, `page`, `page_size`, `pages`).
- [x] API `PATCH /api/v1/clients/{client_id}` (AC: 3)
  - [x] Implementar serializer de atualizacao parcial.
  - [x] Retornar `404` (`client_not_found`) quando o UUID nao existir.
  - [x] Logar evento `crm.client.updated` com campos alterados.
- [x] Testes de integracao para CRUD/filtros (AC: 1, 2, 3)
  - [x] Criacao com sucesso (`201`) e payload invalido (`400`).
  - [x] Listagem paginada com filtros combinados por status e busca.
  - [x] Atualizacao parcial (`200`) e cliente inexistente (`404`).

## Dev Notes

- Reutilizar padroes de API do projeto: envelopes `success_response`/`error_response`, `correlation_id`, e codigos de erro consistentes.
- Manter naming e contratos em `snake_case`.
- Endpoint e mutacoes protegidos por `IsAuthenticated` + `IsStaffOrSuperuser`, alinhado ao padrao administrativo da API atual.

### Technical Requirements

- Endpoints em `/api/v1/clients` e `/api/v1/clients/{client_id}`.
- `status` aceito: `active` ou `inactive`.
- Parametros de listagem:
  - `status`: opcional (`active` | `inactive`)
  - `search`: opcional (busca textual em `name`)
  - `page`: opcional, default `1`
  - `page_size`: opcional, default `20`, max `100`

### Architecture Compliance

- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns]

### Library / Framework Requirements

- Django + DRF (stack atual do projeto).
- Testes com `pytest` e `rest_framework.test.APIClient`.

### File Structure Requirements

- Novo app em `blackbeans_api/clients/` (models, apps, migrations).
- Serializers/Views em `blackbeans_api/api/clients_serializers.py` e `blackbeans_api/api/clients_views.py`.
- Registro de rotas em `blackbeans_api/api/urls.py`.

### Testing Requirements

- Cobrir todos os ACs com testes de API.
- Garantir cobertura de filtros combinados e pagina vazia quando nao houver resultados.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 2.1]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns]
- [Source: `_bmad-output/planning-artifacts/prd.md` - FR13, FR14]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run python manage.py makemigrations clients`
- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run python manage.py migrate --noinput`
- `docker compose -f infra/docker-compose.dev.yml run --rm api uv run pytest tests/integration/test_clients_api.py -q`

### Implementation Plan

- Implementar app `clients` com modelo e migrações.
- Expor endpoints `POST/GET/PATCH` seguindo envelope padrao.
- Criar testes de integracao cobrindo criacao, listagem filtrada/paginada e atualizacao.

### Completion Notes List

- App `clients` criado com modelo `Client` e migracao inicial `0001_initial`.
- Endpoints `POST /api/v1/clients`, `GET /api/v1/clients` e `PATCH /api/v1/clients/{client_id}` implementados com envelope padrao.
- Listagem com filtros combinados (`status` + `search`) e paginacao (`page`, `page_size`, max 100).
- Logs operacionais adicionados para criacao e atualizacao (`crm.client.created`, `crm.client.updated`).
- Testes de integracao da story executados com sucesso (5 passed).

### File List

- `_bmad-output/implementation-artifacts/2-1-crud-de-clientes-com-listagem-e-filtros-por-status.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/blackbeans_api/clients/__init__.py`
- `blackbeans-api/blackbeans_api/clients/apps.py`
- `blackbeans-api/blackbeans_api/clients/models.py`
- `blackbeans-api/blackbeans_api/clients/migrations/__init__.py`
- `blackbeans-api/blackbeans_api/clients/migrations/0001_initial.py`
- `blackbeans-api/blackbeans_api/clients/tests/__init__.py`
- `blackbeans-api/blackbeans_api/clients/tests/factories.py`
- `blackbeans-api/blackbeans_api/api/clients_serializers.py`
- `blackbeans-api/blackbeans_api/api/clients_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/tests/integration/test_clients_api.py`

### Change Log

- 2026-04-20: Story gerada pelo ciclo `bmad-create-story`.
- 2026-04-20: Implementacao `dev-story` da 2.1 concluida (modelo, endpoints CRUD parcial e testes de integracao).
- 2026-04-20: `bmad-code-review` executado; sem findings de severidade alta/media para bloquear merge.

### Review Findings

- [x] [Review][Approve] Fluxo `POST/GET/PATCH /clients` aderente aos ACs da story 2.1 e ao envelope padrao de API.
- [x] [Review][Approve] Cobertura de testes de integracao suficiente para criacao, filtro/paginacao e atualizacao parcial.
- [ ] [Review][Patch] Opcional: retornar `meta.has_next`/`meta.has_prev` para facilitar consumo de paginacao no frontend sem calculo adicional.
