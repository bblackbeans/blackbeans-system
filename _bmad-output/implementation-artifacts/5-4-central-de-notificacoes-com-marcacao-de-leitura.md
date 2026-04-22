# Story 5.4: Central de notificacoes com marcacao de leitura

Status: done

## Story

As a Usuario autenticado,  
I want visualizar central de notificacoes e marcar itens como lidos,  
so that eu gerencie meu backlog de alertas operacionais.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /notifications` e `POST /notifications/{id}/read`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint `GET /api/v1/notifications` implementado com paginação por recência.
- Representação inclui estado de leitura e metadados de ação.
- Endpoint `POST /api/v1/notifications/{id}/read` implementado para dono da notificação.
- Bloqueio de acesso cruzado garantido por filtro direto no `user=request.user`.
- Teste de integração cobrindo listagem e marcação como lida.

### Review Findings

- [x] [Review][Patch] Garantido isolamento por usuário na operação de leitura.
- [x] [Review][Approve] AC de central de notificações atendido.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
