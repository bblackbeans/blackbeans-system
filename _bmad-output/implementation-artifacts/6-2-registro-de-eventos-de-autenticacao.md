# Story 6.2: Registro de eventos de autenticacao

Status: done

## Story

As a Superusuario,  
I want registrar login, falha e logout de autenticacao,  
so that eu monitore seguranca de acesso administrativo e operacional.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (auditoria de sucesso/falha em auth).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- `auth.login_failed` registrado para credenciais inválidas.
- `auth.login_challenge_created` e `auth.login_success` registrados no fluxo com 2FA.
- `auth.refresh_failed` e `auth.refresh_success` adicionados no refresh de token.
- Todos os eventos carregam `correlation_id`.
- Teste de integração cobrindo falha de login e geração de log.

### Review Findings

- [x] [Review][Patch] Cobertura de eventos de falha no fluxo de autenticação.
- [x] [Review][Approve] Rastreabilidade ponta a ponta via correlation id.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
