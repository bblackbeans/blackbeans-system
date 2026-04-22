# Story 1.5: Gestao de colaborador (departamento) e perfil proprio

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want cadastrar e manter dados de colaborador com associacao a departamento, e permitir que o colaborador visualize seu proprio perfil,  
so that a estrutura organizacional fique consistente e cada pessoa tenha clareza dos seus dados profissionais.

## Acceptance Criteria

1. **Given** um admin autenticado e autorizado  
   **When** ele fizer `POST /api/v1/collaborators` com dados validos do colaborador  
   **Then** a API deve retornar `201` com colaborador criado em envelope de sucesso  
   **And** o colaborador deve estar pronto para vinculo com usuario do sistema.

2. **Given** um colaborador existente  
   **When** o admin fizer `PATCH /api/v1/collaborators/{collaborator_id}` para atualizar dados profissionais permitidos  
   **Then** a API deve retornar `200` com os dados atualizados  
   **And** validacoes de dominio devem ser aplicadas com erro padronizado em caso de falha.

3. **Given** um departamento existente  
   **When** o admin fizer `POST /api/v1/collaborators/{collaborator_id}/department-links` informando `department_id`  
   **Then** a API deve retornar sucesso com associacao ativa colaborador-departamento  
   **And** deve impedir associacao invalida/duplicada conforme regra de negocio.

4. **Given** um colaborador autenticado (nao admin)  
   **When** ele fizer `GET /api/v1/me/collaborator-profile`  
   **Then** a API deve retornar `200` apenas com os dados do seu proprio perfil profissional  
   **And** nao deve permitir acesso a perfis de outros colaboradores por esse endpoint.

5. **Given** criacao/edicao de colaborador ou mudanca de associacao com departamento  
   **When** a operacao for concluida  
   **Then** deve existir evento de auditoria com `actor_id`, escopo e tipo de alteracao  
   **And** a resposta deve seguir envelope padrao com `correlation_id` em caso de erro.

## Tasks / Subtasks

- [x] Modelagem `Department` e extensao de `Collaborator` (AC: 1, 2, 3, 5)
  - [x] Introduzir modelo `Department` minimo (ex.: `id` UUID, `name`, `code` opcional, timestamps) com migracao Django — **nao** criar FK para `Workspace` nesta story se o modelo `Workspace` ainda nao existir; se necessario para alinhamento futuro, usar `workspace_id` **nullable** sem FK ou registrar decisao no Dev Agent Record.
  - [x] Estender `Collaborator` com campos profissionais aditivos (migracao): lista fechada inicial sugerida — `professional_email` (opcional), `phone` (opcional), `job_title` (opcional) — alem de manter `display_name`; ajustar nomes se o time padronizar outro vocabulario, mantendo `snake_case`.
  - [x] Introduzir modelo de vinculo `CollaboratorDepartmentLink` (FK `Collaborator`, FK `Department`, `is_active`, timestamps) com **no maximo um vinculo ativo por colaborador** (UniqueConstraint parcial semelhante a `UserCollaboratorLink`).
- [x] API admin de colaboradores (AC: 1, 2, 5)
  - [x] `POST /api/v1/collaborators` — criacao com envelope `data` + `201`.
  - [x] `PATCH /api/v1/collaborators/{collaborator_id}` — atualizacao com lista fechada de campos editaveis; `404` + `collaborator_not_found` quando UUID invalido/inexistente.
  - [x] Autenticacao JWT + `IsStaffOrSuperuser` (mesmo padrao da story 1.4).
  - [x] Logs estruturados `iam.collaborator.created` / `iam.collaborator.updated` com `actor_id`, `correlation_id`, `collaborator_id` (sem dados sensiveis).
- [x] API admin de vinculo colaborador-departamento (AC: 3, 5)
  - [x] `POST /api/v1/collaborators/{collaborator_id}/department-links` com body `{"department_id": "<uuid>"}`.
  - [x] Regras: validar existencia de `Department`; impedir segundo vinculo **ativo** para o mesmo colaborador (retornar `409` + `link_conflict` ou codigo alinhado ao padrao 1.4); definir semantica de **substituicao** (desativar vinculo ativo anterior e criar novo em transacao) **ou** exigir `DELETE` previo — **escolher uma semantica**, documentar no Dev Agent Record e cobrir com testes.
  - [ ] Opcional nesta story: `DELETE /api/v1/collaborators/{collaborator_id}/department-links/{department_id}` para desassociacao explicita — incluir apenas se a semantica escolhida exigir. (Nao incluido: semantica de substituicao via `POST` cobre troca de departamento.)
  - [x] Log `iam.collaborator.department_linked` (e desvinculo se existir) com metadados minimos.
- [x] Perfil proprio do colaborador (AC: 4, 5)
  - [x] `GET /api/v1/me/collaborator-profile` autenticado com JWT; **nao** exigir `is_staff`/`is_superuser`.
  - [x] Resolver colaborador do ator: usuario autenticado -> `UserCollaboratorLink` ativo (`is_active=True`) -> `Collaborator`; se nao houver vinculo ativo, retornar `404` com envelope (`code` sugerido: `collaborator_profile_not_found`) e `correlation_id`.
  - [x] Resposta `200` com payload somente leitura do proprio perfil (dados do `Collaborator` + departamento ativo resumido, sem expor outros colaboradores).
  - [x] Log `INFO` opcional em leitura (evitar spam): apenas se arquitetura de observabilidade exigir; caso contrario, auditar apenas mutacoes (AC 5 foca em alteracoes).
- [x] Testes automatizados (AC: 1–5)
  - [x] Integracao para CRUD de colaborador (admin) e erros (`400`/`404`/`409`).
  - [x] Integracao para vinculo com departamento e regra de unicidade ativa.
  - [x] Integracao para `GET /me/collaborator-profile` com usuario vinculado a colaborador e caso sem vinculo.
  - [x] Regressao: rotas de auth (`test_auth_tokens_api.py`) e usuarios (`test_users_api.py`) permanecem verdes.

## Dev Notes

- Esta story **depende** da **1.4** (modelo `Collaborator`, `UserCollaboratorLink`, padroes de API, `responses.py`, `exceptions.py`, `IsStaffOrSuperuser`, helper `tests/integration/auth_helpers.py`).
- O modelo `Collaborator` hoje tem apenas `display_name`; toda extensao deve ser **migracao aditiva** compativel com dados ja criados na 1.4.
- **RBAC por escopo** (workspace/portfolio/project/board) fica para stories **1.6/1.7**; aqui o escopo de autorizacao e: admin para mutacoes; usuario autenticado para leitura do proprio perfil via `/me/...`.
- **2FA:** permanece obrigatorio para **login admin** (1.3); colaborador nao-admin obtem JWT via fluxo ja existente para usuarios comuns **se** o produto permitir emissao de token para nao-staff — hoje o login administrativo exige staff; para testar `GET /me/collaborator-profile`, usar **`RefreshToken.for_user`** (ou equivalente) nos testes de integracao, como ja feito em `test_users_api.py` para o caso `403`, **ou** introduzir endpoint de emissao de token para usuario padrao (fora de escopo desta story salvo necessidade explicita — preferir testes com JWT via SimpleJWT direto).

### Technical Requirements

- Prefixo `/api/v1/...`, JSON `snake_case`, envelopes de sucesso/erro e `correlation_id` + header `X-Correlation-ID` alinhados a `blackbeans_api/api/responses.py`.
- IDs de entidades expostas em rotas: manter **UUID** para `collaborator_id` e `department_id` na URL onde o epic indicar UUID.
- Codigos de erro consistentes com a story 1.4 (`user_not_found`, `link_conflict`, `validation_error`, `not_authenticated`, `forbidden`, etc.), adicionando `collaborator_not_found`, `department_not_found`, `collaborator_profile_not_found` conforme necessario.

### Architecture Compliance

- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns] Envelopes e erros padronizados.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns] Recursos no plural (`/collaborators`, `/me/...`).
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Data Architecture] Constraints e validacao em camadas.

### Library / Framework Requirements

- Django 6.x, DRF, SimpleJWT (existentes).
- `pytest` + `APIClient` para testes de integracao.

### File Structure Requirements

- Concentrar views de colaborador/departamento/perfil em `blackbeans_api/api/` (ex.: `collaborators_views.py`, `collaborators_serializers.py`) e registrar em `blackbeans_api/api/urls.py`.
- Modelos `Department` e `CollaboratorDepartmentLink` podem residir em `blackbeans_api/users/models.py` **ou** novo app `org`/`structure` — **escolher um** e nao duplicar entidades; preferencia por manter coeso com `Collaborator` no app `users` ate surgir divisao arquitetural clara.

### Testing Requirements

- Cobrir todos os ACs com testes HTTP.
- Reutilizar `obtain_admin_access_token` para cenarios admin (fluxo 2FA).
- Para colaborador nao-admin em `/me/collaborator-profile`, garantir usuario com `UserCollaboratorLink` ativo apontando para o `Collaborator` sob teste.

### Previous Story Intelligence

- [Source: `_bmad-output/implementation-artifacts/1-4-gestao-de-usuarios-e-vinculo-com-colaborador.md`] Padroes de auditoria (`iam.user.*`, `iam.collaborator.linked`); erro `link_not_found` para recursos de vinculo inexistentes quando aplicavel.
- [Source: `blackbeans-api/blackbeans_api/api/users_views.py`] Referencia de estrutura de views admin + logs.

### Latest Tech Information

- Django 6 `UniqueConstraint` com `condition` continua adequado para vinculos ativos unicos.
- DRF `APIView` + serializers explicitos mantem contrato estavel para OpenAPI futuro.

### Project Structure Notes

- Frontend fora de escopo; apenas contrato API estavel.
- Se OpenAPI (drf-spectacular) ainda nao estiver instalado, registrar follow-up; nao bloquear entrega da story.

### Exemplos de payload (referencia)

**`POST /api/v1/collaborators`:**

```json
{
  "display_name": "Maria Silva",
  "job_title": "Designer",
  "professional_email": "maria.silva@agencia.example",
  "phone": "+5511999990000"
}
```

**`PATCH /api/v1/collaborators/{collaborator_id}`:**

```json
{
  "job_title": "Senior Designer",
  "phone": "+5511888880000"
}
```

**`POST /api/v1/collaborators/{collaborator_id}/department-links`:**

```json
{
  "department_id": "660e8400-e29b-41d4-a716-446655440000"
}
```

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.5]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns, Naming Patterns]
- [Source: `_bmad-output/implementation-artifacts/1-4-gestao-de-usuarios-e-vinculo-com-colaborador.md`]
- [Source: `blackbeans-api/blackbeans_api/users/models.py`]
- [Source: `blackbeans-api/blackbeans_api/api/urls.py`]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml exec api uv run python manage.py migrate --noinput`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest tests/integration/ -q` — 26 passed (2026-04-17); pos code review — 27 passed (2026-04-17).

### Completion Notes List

- Story 1.5 criada pos-1.4: evolui `Collaborator`, introduz `Department`, vinculo colaborador-departamento e leitura de perfil proprio via `/me/collaborator-profile`.
- **Semantica de `POST .../department-links`:** substituicao em transacao (`select_for_update` + desativar vinculos ativos + criar novo). Requisicao idempotente com o **mesmo** `department_id` ja ativo retorna `200` sem novo log. `IntegrityError` retorna `409` + `link_conflict`.
- Departamentos sao criados via ORM/migracao de dados para testes; nao ha endpoint admin de CRUD de `Department` nesta story (fora do escopo dos ACs).

### File List

- `_bmad-output/implementation-artifacts/1-5-gestao-de-colaborador-departamento-e-perfil-proprio.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `blackbeans-api/blackbeans_api/users/models.py`
- `blackbeans-api/blackbeans_api/users/migrations/0003_department_collaborator_extensions.py`
- `blackbeans-api/blackbeans_api/api/collaborators_serializers.py`
- `blackbeans-api/blackbeans_api/api/collaborators_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/blackbeans_api/users/tests/factories.py`
- `blackbeans-api/tests/integration/test_collaborators_api.py`

### Change Log

- Documento de story gerado pelo workflow `bmad-create-story`.
- Implementacao dev-story 1.5: modelos, API de colaboradores, vinculo departamento, perfil `/me/collaborator-profile`, testes de integracao.
- Code review (2026-04-17): PATCH sem campos validos nao persiste nem emite `iam.collaborator.updated`; teste `collaborator_not_found` em `POST .../department-links`.

### Review Findings

- [x] [Review][Patch] Auditoria em PATCH sem mudanca efetiva — `PATCH` com `{}` ou apenas campos omitidos ainda dispara `iam.collaborator.updated` com `fields=[]`, o que dilui AC5 (evento apos edicao concluida) e gera ruido. Preferir logar apenas quando `validated_data` nao estiver vazio (apos `is_valid`), ou comparar estado antes/depois. [`blackbeans-api/blackbeans_api/api/collaborators_views.py` ~112-122] — corrigido em code review (2026-04-17).
- [x] [Review][Patch] Cobertura de erro em vinculo de departamento — nao ha teste de integracao para `POST /api/v1/collaborators/{uuid}/department-links` com colaborador inexistente (`404` + `collaborator_not_found`), embora a view trate. Adicionar um caso em `test_collaborators_api.py`. [`blackbeans-api/tests/integration/test_collaborators_api.py`] — corrigido em code review (2026-04-17).
