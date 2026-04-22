# Story 5.5: Contador de notificacoes nao lidas

Status: done

## Story

As a Usuario autenticado,  
I want visualizar contador de notificacoes nao lidas,  
so that eu priorize rapidamente pendencias de comunicacao operacional.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /notifications/unread-count`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint `GET /api/v1/notifications/unread-count` implementado.
- Contagem baseada em `is_read=false` e filtrada por usuário autenticado.
- Consistência garantida após marcação de leitura no endpoint dedicado.
- Teste de integração cobrindo antes/depois da leitura.

### Review Findings

- [x] [Review][Patch] Consistência da contagem validada com atualização de estado.
- [x] [Review][Approve] AC de contador de não lidas atendido.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
