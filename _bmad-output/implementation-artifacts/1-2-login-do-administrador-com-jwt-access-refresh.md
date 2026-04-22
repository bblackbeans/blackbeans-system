# Story 1.2: Login do Administrador com JWT (access + refresh)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want autenticar com credenciais seguras e receber `access_token` (curto) e `refresh_token` (rotativo),  
so that eu consiga acessar recursos protegidos com autenticacao e base para autorizacao por escopo.

## Acceptance Criteria

1. **Given** um usuario Admin/Superusuario cadastrado e ativo (com credenciais validas)  
   **When** eu fizer `POST /api/v1/auth/tokens` enviando credenciais validas  
   **Then** a API deve retornar `200` com envelope de sucesso contendo `data.access_token`, `data.refresh_token`, `data.token_type` e identificador do ator  
   **And** o `access_token` deve conter expiracao (`exp`) e identificacao do ator autenticado.
2. **Given** credenciais invalidas (senha incorreta ou usuario inexistente)  
   **When** eu fizer `POST /api/v1/auth/tokens`  
   **Then** a API deve retornar `401` com envelope de erro padronizado contendo `error.code`, `error.message` e `correlation_id`  
   **And** nenhum token deve ser retornado.
3. **Given** um `refresh_token` valido e nao expirado  
   **When** eu fizer `POST /api/v1/auth/tokens/refresh` enviando o `refresh_token`  
   **Then** a API deve retornar `200` com novo `access_token`  
   **And** deve retornar um novo `refresh_token` (rotacao).
4. **Given** um `refresh_token` rotacionado anteriormente (ja invalidado)  
   **When** eu tentar reutiliza-lo em `POST /api/v1/auth/tokens/refresh`  
   **Then** a API deve retornar `401` com `error.code` apropriado para token invalido e `correlation_id`  
   **And** nenhum token deve ser retornado.
5. **Given** um `refresh_token` expirado  
   **When** eu fizer `POST /api/v1/auth/tokens/refresh`  
   **Then** a API deve retornar `401` com `error.code` apropriado para token expirado e `correlation_id`  
   **And** a resposta deve seguir o envelope de erro padronizado da plataforma.

## Tasks / Subtasks

- [x] Implementar endpoint de emissao de tokens JWT para login admin (AC: 1, 2)
  - [x] Criar endpoint `POST /api/v1/auth/tokens` no modulo de IAM.
  - [x] Validar credenciais, status ativo do usuario e restricao de perfil administrativo.
  - [x] Responder com envelope de sucesso padronizado contendo `access_token`, `refresh_token`, `token_type` e identificador do ator.
  - [x] Garantir resposta `401` com envelope de erro padronizado em credenciais invalidas.
- [x] Implementar endpoint de refresh com rotacao de token (AC: 3, 4, 5)
  - [x] Criar endpoint `POST /api/v1/auth/tokens/refresh`.
  - [x] Habilitar rotacao de refresh token e invalidacao (blacklist) do token anterior.
  - [x] Tratar cenarios de token invalido, reutilizado e expirado com `401` + `error.code` coerente.
- [x] Configurar stack de autenticacao JWT no backend (AC: 1, 3, 4, 5)
  - [x] Configurar biblioteca JWT escolhida no `settings` de ambiente.
  - [x] Definir tempos de vida de access/refresh e estrategia de assinatura.
  - [x] Garantir claims minimas (`exp`, identificador do ator, tipo de token).
- [x] Garantir contrato de API e observabilidade (AC: 1, 2, 3, 4, 5)
  - [x] Padronizar respostas no envelope da plataforma (`data/meta` e `error/correlation_id`).
  - [x] Garantir registro de `correlation_id` para sucesso/erro.
  - [x] Preparar logs estruturados de autenticacao (sem expor segredo/token completo).
- [x] Validar com testes automatizados (AC: 1, 2, 3, 4, 5)
  - [x] Testes de integracao para login valido/invalido.
  - [x] Testes de integracao para refresh valido/expirado/reutilizado.
  - [x] Testes de contrato para formato de resposta e codigos HTTP esperados.

## Dev Notes

- Esta story inaugura a fundacao de autenticacao da plataforma e deve manter compatibilidade futura com 2FA obrigatoria da story 1.3.
- Implementar de forma incremental: primeiro token login + refresh, depois 2FA e RBAC completo em stories seguintes.
- Nao introduzir controle de permissao por escopo nesta story; foco em autenticacao com contrato de API solido.

### Technical Requirements

- API em `/api/v1/...` com endpoints REST em plural/semantica definida.
- JWT com `access` curto e `refresh` rotativo conforme arquitetura.
- Respostas sempre no formato padrao da plataforma:
  - sucesso: `{ "data": ..., "meta": ... }`
  - erro: `{ "error": { "code", "message", "details" }, "correlation_id": "..." }`
- Logs estruturados com `correlation_id`, preservando seguranca (sem imprimir segredos/tokens brutos).

### Architecture Compliance

- Implementacao no backend `blackbeans-api`, dentro do dominio de IAM.
- Autenticacao centralizada no backend; frontend consome apenas API.
- Manter padroes de naming (`snake_case` backend/API) e contratos consistentes.
- Preparar terreno para 2FA sem acoplamento prematuro da story 1.3.

### Library / Framework Requirements

- Django + DRF (base do projeto).
- JWT preferencial com `djangorestframework-simplejwt`.
- Para refresh rotativo, habilitar:
  - `ROTATE_REFRESH_TOKENS = True`
  - `BLACKLIST_AFTER_ROTATION = True` (com app de blacklist habilitado)
- Referencia de versao pesquisada: `simplejwt` serie `5.5.x`.

### File Structure Requirements

- Conter implementacao de auth no backend, preservando organizacao por dominio.
- Testes backend em `blackbeans-api/tests/integration` e/ou `blackbeans-api/tests/contracts`.
- Evitar espalhar regras de autenticacao em modulos de dominio nao relacionados.

### Testing Requirements

- Cobrir cenarios positivos e negativos de login.
- Cobrir refresh com rotacao e tentativas de reutilizacao de refresh token invalidado.
- Validar formato do envelope de erro e presenca de `correlation_id`.
- Confirmar ausencia de regressao no bootstrap ja concluido da story 1.1.

### Previous Story Intelligence

- A story 1.1 estabilizou stack Docker com `api`, `web`, `worker`, `redis`, `postgres`, `proxy`.
- Migrations precisam ser executadas em ambiente novo para evitar erro de tabelas ausentes.
- Compose dev foi ajustado para hot reload; manter este fluxo nas implementacoes seguintes.

### Project Structure Notes

- Sequencia arquitetural definida: IAM/RBAC como fundacao transversal apos bootstrap inicial.
- Esta story deve entregar base de autenticacao reutilizavel para todas as APIs subsequentes.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.2]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Authentication & Security]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns]
- [Source: `_bmad-output/implementation-artifacts/1-1-setup-inicial-do-projeto-a-partir-de-starter-template.md`]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `sprint-status.yaml` atualizado para 1.1 done e 1.2 ready-for-dev
- web check: SimpleJWT refresh rotation / blacklist (serie 5.5.x)
- `docker compose -f infra/docker-compose.dev.yml exec api uv sync --group dev`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run python manage.py migrate`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest tests/integration/test_auth_tokens_api.py`

### Completion Notes List

- Endpoints implementados: `POST /api/v1/auth/tokens` e `POST /api/v1/auth/tokens/refresh`.
- Login restrito para usuario ativo com perfil administrativo (`is_staff` ou `is_superuser`).
- Rotacao de refresh token habilitada com blacklist do token anterior.
- Envelope padronizado aplicado para sucesso (`data/meta`) e erro (`error/correlation_id`).
- Claims incluem `exp` (SimpleJWT padrao) e `actor_id` customizado.
- Testes de integracao cobrindo: login valido/invalido, refresh valido, refresh reutilizado e refresh expirado.

### File List

- `_bmad-output/implementation-artifacts/1-2-login-do-administrador-com-jwt-access-refresh.md`
- `blackbeans-api/pyproject.toml`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/config/urls.py`
- `blackbeans-api/blackbeans_api/api/__init__.py`
- `blackbeans-api/blackbeans_api/api/utils.py`
- `blackbeans-api/blackbeans_api/api/auth_serializers.py`
- `blackbeans-api/blackbeans_api/api/auth_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/tests/integration/test_auth_tokens_api.py`
- `blackbeans-api/uv.lock`

## Change Log

- 2026-04-17: Implementacao da story 1.2 com JWT access+refresh rotativo, envelopes padronizados e testes de integracao.
