# Story 5.3: Notificacoes assincronas de atraso e prazo proximo

Status: done

## Story

As a Coordenador,  
I want receber alertas automaticos de atraso e prazo proximo,  
so that eu consiga agir antes do comprometimento da entrega.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (rotina assíncrona de varredura de prazo).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Task Celery `dispatch_deadline_notifications` criado para detectar atraso e prazo próximo.
- Alertas `task_overdue` e `task_due_soon` com severidade em metadata.
- Janela anti-duplicação de 6 horas para evitar alertas repetitivos em curto intervalo.
- Endpoint administrativo `POST /notifications/deadline-scan` para enfileirar varredura.
- Teste de integração validando não-duplicação em chamadas consecutivas.

### Review Findings

- [x] [Review][Patch] Controle de duplicidade por janela curta implementado.
- [x] [Review][Approve] Alertas assíncronos atendem AC de prevenção operacional.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
