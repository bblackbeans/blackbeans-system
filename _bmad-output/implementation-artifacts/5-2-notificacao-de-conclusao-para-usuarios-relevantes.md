# Story 5.2: Notificacao de conclusao para usuarios relevantes

Status: done

## Story

As a Coordenador/Gestor,  
I want receber notificacao de conclusao de tarefa relevante,  
so that eu acompanhe progresso sem monitoramento manual continuo.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (evento de conclusão assíncrono para destinatários relevantes).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint `POST /tasks/{id}/complete` passou a enfileirar notificação de conclusão.
- Worker notifica assignee e superusers ativos como destinatários relevantes iniciais.
- Payload de metadata contém `actor_id` e `correlation_id` para rastreabilidade.
- Teste de integração garantindo notificação de conclusão para usuário relevante.

### Review Findings

- [x] [Review][Patch] Entrega assíncrona com retry/backoff aplicado no task worker.
- [x] [Review][Approve] Fluxo de conclusão + notificação está consistente.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
