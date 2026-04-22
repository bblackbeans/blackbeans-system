# Story 7.2: Login JWT e verificacao 2FA no frontend

Status: done

## Story

As a Admin/Superusuario,
I want autenticar com credenciais + 2FA na interface web,
so that eu acesse o sistema frontend com sessao valida integrada ao backend.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (form de credenciais, etapa 2FA e persistencia de token).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Fluxo de login frontend integrado aos endpoints `/auth/tokens` e `/auth/tokens/2fa/verify`.
- Persistencia de `access_token` e `refresh_token` em storage local para sessao web.
- Acao de refresh de token integrada em `/auth/tokens/refresh`.
- Tratamento de erro padronizado com mensagem de API.

### Review Findings

- [x] [Review][Patch] Refinado fluxo de fallback para sessao expirada com logout seguro.
- [x] [Review][Approve] AC de login + 2FA atendido no frontend.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
