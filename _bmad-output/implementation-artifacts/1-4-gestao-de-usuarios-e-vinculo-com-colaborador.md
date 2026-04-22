# Story 1.4: Gestao de usuarios e vinculo com colaborador

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want criar/atualizar/desativar usuarios e vincula-los a colaboradores,  
so that eu mantenha controle de acesso e identidade operacional coerente com a estrutura da agencia.

## Acceptance Criteria

1. **Given** um admin autenticado e autorizado  
   **When** ele fizer `POST /api/v1/users` com dados validos de um novo usuario  
   **Then** a API deve retornar `201` com o usuario criado em envelope de sucesso  
   **And** o usuario deve iniciar em estado ativo por padrao (ou conforme regra enviada no payload).

2. **Given** um usuario existente  
   **When** o admin fizer `PATCH /api/v1/users/{user_id}` para atualizar dados permitidos  
   **Then** a API deve retornar `200` com os dados atualizados  
   **And** alteracoes invalidas devem retornar erro padronizado com `correlation_id`.

3. **Given** um usuario existente com atividades historicas  
   **When** o admin fizer `PATCH /api/v1/users/{user_id}` alterando `is_active` para `false`  
   **Then** o usuario deve ficar impedido de autenticar novos acessos  
   **And** os registros historicos/auditoria devem permanecer preservados (sem exclusao fisica do usuario).

4. **Given** um colaborador existente sem vinculo de usuario (ou elegivel para novo vinculo conforme regra abaixo)  
   **When** o admin fizer `POST /api/v1/users/{user_id}/collaborator-links` informando `collaborator_id`  
   **Then** a API deve retornar `201` com vinculo ativo criado  
   **And** deve impedir duplicidade de vinculo invalido conforme regra de negocio explicitada nos Dev Notes.

5. **Given** um vinculo usuario-colaborador existente  
   **When** o admin fizer remocao/desassociacao via endpoint de vinculo (ver contrato em Dev Notes)  
   **Then** a API deve retornar sucesso e refletir o vinculo removido  
   **And** deve registrar evento de auditoria de criacao/edicao/desativacao/desvinculacao (via logs estruturados minimos, sem dados sensiveis).

## Tasks / Subtasks

- [x] Modelagem de dominio para vinculo usuario-colaborador (AC: 4, 5)
  - [x] Introduzir modelo `Collaborator` **minimo** nesta story (UUID `id`, campos basicos de identidade, `created_at`/`updated_at`) com migracao Django, pois o repositorio ainda nao possui entidade `Collaborator` e o epic 1.4 exige `collaborator_id` existente.
  - [x] Introduzir modelo de vinculo (ex.: `UserCollaboratorLink`) com FK para `User` e `Collaborator`, flag `is_active` ou semantica de desvinculo clara, e constraints UNIQUE alinhadas as regras de negocio abaixo.
  - [x] Registrar apps em `INSTALLED_APPS` se criar novo app de dominio; caso mantenha em `users`, justificar no Dev Agent Record.
- [x] Contrato REST de usuarios (AC: 1, 2, 3)
  - [x] Implementar `POST /api/v1/users` (criacao) com envelope `{ "data": ..., "meta": {} }` e `201`.
  - [x] Implementar `PATCH /api/v1/users/{user_id}` com campos permitidos explicitamente (lista fechada: ex. `email`, `name`, `is_active`, senha opcional se desejado — documentar escolha).
  - [x] Garantir que `is_active=false` bloqueie autenticacao futura (compativel com `authenticate` + checagens ja usadas em IAM).
  - [x] Validacoes de entrada com erro `400` + envelope padronizado; regras de negocio com `409` ou `422` conforme tabela de codigos em Dev Notes.
- [x] Contrato REST de vinculo (AC: 4, 5)
  - [x] Implementar `POST /api/v1/users/{user_id}/collaborator-links` com body JSON `{"collaborator_id": "<uuid>"}`.
  - [x] Implementar desassociacao: `DELETE /api/v1/users/{user_id}/collaborator-links/{collaborator_id}` (ou path equivalente documentado) retornando `204` ou `200` com `data` consistente — **definir e manter um unico contrato** na implementacao e refletir nos testes.
  - [x] Aplicar regras: (a) um mesmo `Collaborator` nao pode ter mais de um vinculo **ativo** com usuarios distintos; (b) um mesmo `User` nao pode ter mais de um vinculo **ativo** com colaboradores distintos — ajustar se o PRD/epic local tiver variante, mas o padrao aqui e 1:1 ativo.
- [x] Autorizacao e seguranca (AC: 1–5)
  - [x] Proteger todos os endpoints com JWT autenticado + perfil administrativo (`is_staff` ou `is_superuser`), alinhado ao padrao das stories 1.2/1.3.
  - [x] Impedir que admin nao-autenticado acesse rotas; respostas `401`/`403` com envelope padronizado e `correlation_id`.
  - [x] Nunca retornar hash de senha ou campos internos irrelevantes nas respostas.
- [x] Auditoria e observabilidade (AC: 5)
  - [x] Logs `INFO`/`WARNING` para criacao/edicao/desativacao e vinculo/desvinculo com `actor_id` (do JWT), `correlation_id`, `user_id`, `collaborator_id` quando aplicavel — **sem** registrar senha ou tokens completos.
- [x] Testes automatizados (AC: 1–5)
  - [x] Testes de integracao para CRUD parcial de usuario e fluxos de erro (validacao, usuario inexistente, nao-admin).
  - [x] Testes para desativacao (`is_active`) e tentativa de login apos desativacao (usar fluxo 1.3: `POST /auth/tokens` + `2fa/verify` ou helper de teste).
  - [x] Testes para vinculo criado, duplicidade invalida, e desvinculo.
  - [x] Manter regressao das rotas de auth existentes (`tests/integration/test_auth_tokens_api.py`).

## Dev Notes

- Esta story assume **Epic 1** em andamento e depende diretamente das stories **1.2** (JWT + envelope), **1.3** (login admin em duas etapas: challenge + verify) e **1.1** (compose/ambiente).
- **Ordem com a story 1.5:** o epic lista 1.4 antes de 1.5, mas o codigo atual **nao** possui modelo `Collaborator`. Para nao bloquear 1.4, esta story **inclui** um modelo `Collaborator` minimo; a story **1.5** deve **estender** o mesmo modelo (departamento, dados profissionais, etc.) sem quebrar migracoes — planejar campos opcionais ou migracoes aditivas.
- **RBAC por escopo (workspace/portfolio/project):** fora de escopo explicito aqui; usar apenas gate de perfil administrativo ate a story 1.6/1.7.
- **Multi-tenant:** arquitetura exige `workspace_id` em entidades de dominio; para o `Collaborator` minimo, incluir `workspace_id` nullable apenas se ja existir conceito de workspace no backend — **se ainda nao existir modelo Workspace**, manter `Collaborator` sem `workspace_id` nesta story e registrar decisao no Dev Agent Record para adicionar na story de estrutura/workspace (evitar FK fantasma).

### Technical Requirements

- Prefixo de API: `/api/v1/...` (ja montado em `config/urls.py`).
- JSON e chaves em `snake_case`.
- Respostas de sucesso: `{ "data": <payload>, "meta": {} }` (permitir `meta` com paginacao futura em listagens).
- Respostas de erro: `{ "error": { "code", "message", "details" }, "correlation_id": "<uuid>" }` + header `X-Correlation-ID` quando aplicavel (reutilizar `get_correlation_id` e o padrao de `error_response` de `auth_views.py` ou extrair helper compartilhado se reduzir duplicacao).
- Identificadores expostos na API: preferir UUID para `Collaborator` e para `user_id` na URL **se** o modelo de usuario passar a expor UUID; **hoje** o `User` do Django usa `id` inteiro — **manter `{user_id}` como PK inteira do User** nesta story para consistencia com o banco e com `actor_id` stringificado no JWT, a menos que uma migracao de UUID para User seja explicitamente aprovada.

### Architecture Compliance

- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns] Envelopes de sucesso/erro e `correlation_id` obrigatorios.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Authentication & Security] JWT + perfis administrativos; auditoria em acoes criticas.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns] Endpoints em plural (`/users`), FKs como `<entidade>_id`.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Data Architecture] Validacao em camadas; constraints no banco para integridade de vinculo.

### Library / Framework Requirements

- Django 6.x + Django REST Framework (ja no projeto).
- Autenticacao JWT via `rest_framework_simplejwt` nas rotas protegidas (`JWTAuthentication`).
- Testes com `pytest` + `APIClient` (padrao atual em `tests/integration/`).

### File Structure Requirements

- Manter rotas IAM sob `blackbeans_api/api/` **ou** criar modulo dedicado (ex.: `blackbeans_api/api/users_views.py`, `users_serializers.py`) e registrar em `blackbeans_api/api/urls.py`.
- Modelos: preferir `blackbeans_api/users/models.py` para `User` existente; se `Collaborator` ficar grande demais, avaliar `blackbeans_api/collaborators/` como novo app — **decidir um local e nao duplicar entidade**.
- Testes novos: `blackbeans-api/tests/integration/test_users_api.py` (ou nome alinhado ao modulo escolhido).

### Testing Requirements

- Cobrir todos os ACs com testes de integracao HTTP reais.
- Para chamadas autenticadas como admin: reutilizar padrao da suite auth (login etapa 1 + leitura do codigo 2FA do cache de teste + `POST /api/v1/auth/tokens/2fa/verify`) — extrair helper compartilhado se eliminar copia/colagem.
- Casos negativos minimos: usuario nao encontrado (`404`), payload invalido (`400`), duplicidade de vinculo (`409`), acesso sem token (`401`), usuario comum sem staff (`403`).

### Previous Story Intelligence

- [Source: `_bmad-output/implementation-artifacts/1-3-verificacao-de-2fa-obrigatoria-para-admins.md`] Login administrativo e **2FA obrigatorio**: nao ha tokens JWT apos apenas `POST /api/v1/auth/tokens`; e necessario `POST /api/v1/auth/tokens/2fa/verify`.
- [Source: `blackbeans-api/blackbeans_api/api/auth_views.py`] Padrao de `error_response`, `correlation_id` e codigos de erro especificos — estender de forma consistente (novos codigos como `user_not_found`, `collaborator_not_found`, `link_conflict`, etc.).
- [Source: `blackbeans-api/blackbeans_api/api/mfa.py`] Cache LocMem em testes; nao assumir Redis para testes unitarios de usuario, mas lembrar que producao pode usar Redis.

### Latest Tech Information

- DRF 3.16 + Django 6: permissoes declarativas por view; preferir `APIView`/`GenericAPIView` com serializers explicitos para contratos estaveis.
- Para unicidade de vinculo, preferir `UniqueConstraint` em Meta do modelo link com `condition` para vinculos ativos, alem de validacao no serializer.

### Project Structure Notes

- Frontend (`blackbeans-web`) **nao** e escopo desta story; apenas garantir contrato API documentavel.
- OpenAPI: arquitetura preve documentacao automatica — se ja houver drf-spectacular ou similar, atualizar; caso contrario, registrar como follow-up pos-MVP no Dev Agent Record.

### Regras de negocio (vinculo usuario-colaborador)

- **Um usuario** pode ter no maximo **um** vinculo **ativo** com colaborador por vez.
- **Um colaborador** pode aparecer em no maximo **um** vinculo **ativo** com usuario por vez.
- Desvinculo remove apenas a associacao (registro em tabela de link ou `is_active=false` no link), **sem** apagar `User` nem `Collaborator` (preserva historia).

### Autenticacao nas rotas protegidas

- Header: `Authorization: Bearer <access_token>` apos fluxo 1.3 completo (verify 2FA).
- `actor_id` no JWT deve ser usado como `actor_id` nos logs de auditoria das mutacoes.

### Exemplos de payload (referencia)

**`POST /api/v1/users` (exemplo minimo):**

```json
{
  "username": "novo.admin",
  "email": "novo.admin@example.com",
  "password": "SenhaForte123!@#",
  "name": "Novo Admin",
  "is_staff": true
}
```

**`PATCH /api/v1/users/{user_id}` (exemplo):**

```json
{
  "name": "Nome Atualizado",
  "is_active": false
}
```

**`POST /api/v1/users/{user_id}/collaborator-links`:**

```json
{
  "collaborator_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Tabela sugerida de `error.code` (extensao do padrao atual)

| Situacao | HTTP | `error.code` (sugestao) |
|----------|------|-------------------------|
| Nao autenticado | 401 | `not_authenticated` |
| Autenticado sem privilegio admin | 403 | `forbidden` |
| Usuario ou colaborador inexistente | 404 | `user_not_found` / `collaborator_not_found` |
| Payload invalido (serializer) | 400 | `validation_error` |
| Violacao de unicidade / vinculo invalido | 409 | `link_conflict` |
| Erro inesperado interno | 500 | `internal_error` (detalhes minimos em `details`) |

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.4]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns, Authentication & Security, Naming Patterns]
- [Source: `_bmad-output/implementation-artifacts/1-3-verificacao-de-2fa-obrigatoria-para-admins.md`]
- [Source: `blackbeans-api/blackbeans_api/users/models.py` - User]
- [Source: `blackbeans-api/blackbeans_api/api/urls.py` - rotas v1 atuais]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest` (43 passed, pos code review)

### Completion Notes List

- Story 1.4 gerada via `bmad-create-story`: contexto consolidado de epics, arquitetura e estado atual do repositorio (auth JWT+2FA, ausencia de `Collaborator` no codigo).
- Decisao documentada: incluir modelo `Collaborator` minimo nesta story para viabilizar `collaborator_id` antes da expansao da story 1.5.
- Modelos `Collaborator` e `UserCollaboratorLink` adicionados ao app `users` (sem novo app) com migracao `0002_collaborator_and_user_link` e constraints UNIQUE parciais para vinculo ativo 1:1.
- Endpoints: `POST/PATCH /api/v1/users`, `POST /api/v1/users/<id>/collaborator-links`, `DELETE /api/v1/users/<id>/collaborator-links/<uuid>` com JWT + `IsStaffOrSuperuser`.
- `REST_FRAMEWORK` agora usa `DEFAULT_PERMISSION_CLASSES=IsAuthenticated` e `EXCEPTION_HANDLER` para envelopes `401`/`403`/`400` alinhados ao contrato.
- `error_response` centralizado em `api/responses.py`; `auth_views` importa de la.
- Helper de teste `tests/integration/auth_helpers.py` para token admin pos-2FA (evitar nome em `conftest` que vira fixture).

### File List

- `blackbeans-api/blackbeans_api/users/models.py`
- `blackbeans-api/blackbeans_api/users/migrations/0002_collaborator_and_user_link.py`
- `blackbeans-api/blackbeans_api/users/tests/factories.py`
- `blackbeans-api/blackbeans_api/api/responses.py`
- `blackbeans-api/blackbeans_api/api/exceptions.py`
- `blackbeans-api/blackbeans_api/api/permissions.py`
- `blackbeans-api/blackbeans_api/api/users_serializers.py`
- `blackbeans-api/blackbeans_api/api/users_views.py`
- `blackbeans-api/blackbeans_api/api/auth_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/tests/integration/auth_helpers.py`
- `blackbeans-api/tests/integration/test_users_api.py`
- `_bmad-output/implementation-artifacts/1-4-gestao-de-usuarios-e-vinculo-com-colaborador.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- Implementacao da gestao de usuarios e vinculo usuario-colaborador (story 1.4) com API REST, auditoria em log e suite de integracao.
- Code review (2026-04-17): `link_not_found` no DELETE de vinculo inexistente; log `iam.user.deactivated` ao definir `is_active=false`.

### Review Findings

- [x] [Review][Patch] Codigo `collaborator_not_found` no 404 do DELETE de vinculo era semanticamente incorreto — renomeado para `link_not_found` [blackbeans-api/blackbeans_api/api/users_views.py]
- [x] [Review][Patch] Evento de auditoria explicito ao desativar usuario (`iam.user.deactivated`) [blackbeans-api/blackbeans_api/api/users_views.py]
- [x] [Review][Defer] Nao ha `POST /api/v1/collaborators` nesta story; criacao de colaborador depende de migracao/seed/admin Django ate a story 1.5 — aceito como escopo incremental
- [x] [Review][Defer] Admin pode desativar a si mesmo via `PATCH` (risco operacional); endurecer com regra de negocio ou role separada em historia futura
