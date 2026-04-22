# Story 5.1: Notificacao por designacao de responsavel

Status: done

## Story

As a Colaborador,  
I want ser notificado quando for designado em uma tarefa,  
so that eu saiba rapidamente que uma nova demanda entrou no meu escopo.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (evento assíncrono de designação + criação de notificação).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `Notification` criado para central interna.
- Evento de designação em `TaskAssigneeView` agora enfileira tarefa Celery.
- Worker cria notificação `task_assigned` com `correlation_id` em metadata.
- Teste de integração validando criação da notificação após atribuição.

### Review Findings

- [x] [Review][Patch] Enfileiramento assíncrono com retry/backoff no worker Celery.
- [x] [Review][Approve] AC atendido com rastreabilidade.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
