# Story 4.1: Iniciar, pausar e retomar cronometro de tarefa

Status: done

## Story

As a Colaborador,  
I want iniciar, pausar e retomar o cronometro diretamente na tarefa,  
so that eu registre meu esforco real sem friccao durante a execucao.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /tasks/{id}/time/start|pause|resume`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `TimeLog` criado para rastrear sessoes ativas, pausadas e concluidas.
- Endpoint de inicio com bloqueio de sessao duplicada por tarefa/usuario.
- Endpoint de pausa com consolidacao de segundos ja executados.
- Endpoint de retomada preservando historico da mesma sessao.
- Teste de integracao cobrindo start/pause/resume e duplicidade.

### Review Findings

- [x] [Review][Patch] Validar conflitos de sessao ativa por usuario/tarefa com erro 409 dedicado.
- [x] [Review][Approve] Fluxo de apontamento atende AC de rastreabilidade.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
