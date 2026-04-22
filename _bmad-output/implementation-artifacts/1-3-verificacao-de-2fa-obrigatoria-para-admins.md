# Story 1.3: Verificacao de 2FA obrigatoria para admins

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want validar um segundo fator apos a autenticacao inicial,  
so that o acesso administrativo fique protegido contra comprometimento de credenciais.

## Acceptance Criteria

1. **Given** um admin com credenciais validas e regra de 2FA obrigatoria para perfil administrativo  
   **When** ele fizer `POST /api/v1/auth/tokens` e concluir a primeira etapa de autenticacao  
   **Then** a API deve retornar autenticacao pendente de 2FA sem emitir tokens finais  
   **And** deve retornar `challenge_id` (ou equivalente) para verificacao do segundo fator.
2. **Given** um `challenge_id` valido e um codigo 2FA correto  
   **When** o admin fizer `POST /api/v1/auth/tokens/2fa/verify` com `challenge_id` e codigo  
   **Then** a API deve retornar `200` com `access_token` e `refresh_token`  
   **And** deve registrar evento de auditoria de login administrativo com 2FA bem-sucedido.
3. **Given** um codigo 2FA invalido  
   **When** o admin fizer `POST /api/v1/auth/tokens/2fa/verify`  
   **Then** a API deve retornar `401` com envelope de erro padronizado e `correlation_id`  
   **And** nao deve emitir tokens.
4. **Given** multiplas tentativas invalidas de 2FA acima do limite configurado  
   **When** uma nova tentativa for feita dentro da janela de bloqueio  
   **Then** a API deve retornar erro de bloqueio temporario conforme contrato (`429` ou `423`)  
   **And** deve registrar evento de seguranca para auditoria.
5. **Given** um `challenge_id` expirado ou ja consumido  
   **When** o admin tentar verificar novamente em `POST /api/v1/auth/tokens/2fa/verify`  
   **Then** a API deve retornar erro de challenge invalido/expirado com `correlation_id`  
   **And** deve exigir novo fluxo de login.

## Tasks / Subtasks

- [x] Adaptar login admin para fluxo em 2 etapas (AC: 1)
  - [x] Atualizar `POST /api/v1/auth/tokens` para retornar estado `2fa_required` para perfis administrativos.
  - [x] Criar/armazenar `challenge_id` com TTL e vinculo ao ator autenticado na primeira etapa.
  - [x] Impedir emissao de `access_token`/`refresh_token` antes da verificacao de 2FA.
- [x] Implementar verificacao de challenge 2FA (AC: 2, 3, 5)
  - [x] Criar endpoint `POST /api/v1/auth/tokens/2fa/verify`.
  - [x] Validar `challenge_id` (existencia, expiracao, consumo) e codigo 2FA.
  - [x] Emitir tokens apenas apos verificacao bem-sucedida.
  - [x] Tratar falhas com envelope padronizado (`error.code`, `correlation_id`).
- [x] Implementar protecao contra brute force de 2FA (AC: 4)
  - [x] Definir limite de tentativas invalidas por challenge/ator.
  - [x] Aplicar janela de bloqueio temporario (`429` ou `423`).
  - [x] Registrar eventos de seguranca para tentativas excedidas.
- [x] Integrar com auditoria e observabilidade (AC: 2, 4, 5)
  - [x] Registrar sucesso de login 2FA e falhas criticas com metadados minimos.
  - [x] Garantir `correlation_id` nas respostas e logs.
  - [x] Nao expor segredos/codigos em logs.
- [x] Cobrir com testes automatizados (AC: 1, 2, 3, 4, 5)
  - [x] Testes de integracao para fluxo completo: login etapa 1 -> verify etapa 2.
  - [x] Testes para codigo invalido, challenge expirado/consumido e tentativas excedidas.
  - [x] Testes de contrato para HTTP/status e envelope de erro.

## Dev Notes

- Esta story evolui diretamente a 1.2: login com JWT deixa de ser emissao imediata para admins e passa a exigir segunda etapa.
- Fluxo deve ser compativel com a base de auth ja criada (tokens, envelope padronizado e `correlation_id`).
- Nao introduzir ainda RBAC por escopo completo nesta story; foco em endurecimento de autenticacao admin.

### Technical Requirements

- Manter API em `/api/v1/...` e naming em `snake_case`.
- Login admin vira fluxo staged:
  - etapa 1 (`/auth/tokens`): autenticacao primaria + retorno de `challenge_id`
  - etapa 2 (`/auth/tokens/2fa/verify`): validacao do segundo fator + emissao de tokens
- Tokens finais continuam com contrato da 1.2 (`access_token`, `refresh_token`, `token_type`).
- Erros sempre no envelope padrao com `correlation_id`.

### Architecture Compliance

- 2FA e requisito explicito da arquitetura para perfis administrativos.
- Implementacao centralizada no backend (IAM), sem confiar em frontend para enforcement.
- Preservar padroes de auditoria de seguranca para login/falha/bloqueio.

### Library / Framework Requirements

- Base atual: Django + DRF + SimpleJWT (1.2).
- Projeto ja inclui `django-allauth[mfa]`; aproveitar componentes/estrategias de MFA quando aderente.
- Guardrails de brute force alinhados a boas praticas OWASP:
  - limite de tentativas
  - bloqueio temporario progressivo
  - trilha de auditoria

### File Structure Requirements

- Concentrar implementacao em modulo de API/auth no backend.
- Evitar espalhar estado de challenge em modulos nao relacionados.
- Testes em `blackbeans-api/tests/integration` (e contracts, se necessario).

### Testing Requirements

- Cobrir sucesso e falha do `verify`.
- Cobrir expiração e reuso de `challenge_id`.
- Cobrir limite de tentativas com retorno de bloqueio.
- Garantir nao regressao da story 1.2.

### Previous Story Intelligence

- Story 1.2 entregou endpoints JWT e envelope padronizado.
- Ajustes de 1.2 diferenciaram `error.code` por tipo de falha (`token_expired`, `token_reused`, fallback).
- Stack de dev da 1.1/1.2 exige migrations em ambiente novo e compose com hot reload.

### Latest Tech Information

- Documentacao de MFA do `django-allauth` reforca fluxo em etapas e formulários/visoes dedicadas de autenticacao MFA.
- Recomendacoes OWASP para MFA apontam limite de tentativas e lockout temporario como controle minimo contra brute force.

### Project Structure Notes

- Sequencia arquitetural continua: auth forte (1.2, 1.3) antes de autorizacao granular/gestao de permissoes.
- Esta story prepara base segura para as próximas histórias de governança.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.3]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Authentication & Security]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns]
- [Source: `_bmad-output/implementation-artifacts/1-2-login-do-administrador-com-jwt-access-refresh.md`]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest tests/integration/test_auth_tokens_api.py`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest`

### Completion Notes List

- Login admin passou a ser staged: etapa 1 retorna `challenge_id`/`2fa_required` e etapa 2 valida o codigo 2FA antes da emissao dos JWTs.
- Challenge 2FA foi implementado com TTL, limite de tentativas e lock temporario com retorno `429`.
- Falhas de verify retornam envelope padronizado com `correlation_id`; sucesso/falha critica foram instrumentados com logs de auditoria.
- Suite de integracao de auth foi atualizada para cobrir fluxo completo de 2FA e cenarios de erro.

### File List

- `_bmad-output/implementation-artifacts/1-3-verificacao-de-2fa-obrigatoria-para-admins.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `blackbeans-api/blackbeans_api/api/auth_serializers.py`
- `blackbeans-api/blackbeans_api/api/auth_views.py`
- `blackbeans-api/blackbeans_api/api/mfa.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/tests/integration/test_auth_tokens_api.py`

### Change Log

- Implementado fluxo de login administrativo com 2FA em duas etapas e novo endpoint `POST /api/v1/auth/tokens/2fa/verify`.
- Adicionada camada de challenge MFA em cache com controle de expiracao, consumo e bloqueio por tentativas invalidas.
- Ajustados testes de integracao para refletir o novo contrato de auth com 9 cenarios validados.
- Code review (2026-04-17): blindagem de codigo estatico em debug, logs de tentativa invalida, tratamento de ator inexistente, validacao de `actor_id` no challenge, teste de `challenge_id` desconhecido.

### Review Findings

- [x] [Review][Patch] Blindagem de `AUTH_2FA_DEBUG_STATIC_CODE` para exigir `DEBUG=True` [blackbeans-api/blackbeans_api/api/mfa.py]
- [x] [Review][Patch] Evitar 500 ao emitir tokens se o usuario do challenge nao existir mais [blackbeans-api/blackbeans_api/api/auth_serializers.py] [blackbeans-api/blackbeans_api/api/auth_views.py]
- [x] [Review][Patch] Rejeitar challenge com `actor_id` ausente antes de marcar como consumido [blackbeans-api/blackbeans_api/api/mfa.py]
- [x] [Review][Patch] Registrar tentativa `invalid_2fa_code` em log de seguranca [blackbeans-api/blackbeans_api/api/auth_views.py]
- [x] [Review][Patch] Teste de contrato para `challenge_id` desconhecido [blackbeans-api/tests/integration/test_auth_tokens_api.py]
- [x] [Review][Defer] OTP gerado e guardado no cache nao equivale a TOTP/WebAuthn ou fluxo django-allauth MFA completo — evoluir entrega/canal em historia futura [blackbeans-api/blackbeans_api/api/mfa.py] — deferred, MVP aceita prova de conceito
- [x] [Review][Defer] Consumo do challenge nao e atomicamente compare-and-delete no backend de cache — risco teorico de corrida sob carga extrema [blackbeans-api/blackbeans_api/api/mfa.py] — deferred, hardening com Redis/lock em historia futura
