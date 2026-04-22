# Story 6.3: Registro de eventos de controle de tempo

Status: done

## Story

As a Superusuario,  
I want auditar eventos de start/pause/resume/complete de tempo,  
so that eu garanta rastreabilidade operacional do esforco registrado.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (auditoria dos eventos de tempo).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoints de tempo registram `time.started`, `time.paused`, `time.resumed`, `time.completed`.
- Logs incluem referência ao `time_log`, tarefa e `workspace_id`.
- Correlação por `correlation_id` preservada em todas as ações.
- Teste de integração cobre o fluxo completo start/pause/resume/complete com auditoria.

### Review Findings

- [x] [Review][Patch] Estrutura de metadados padronizada entre eventos de tempo.
- [x] [Review][Approve] Eventos consultáveis e coerentes com o fluxo operacional.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
