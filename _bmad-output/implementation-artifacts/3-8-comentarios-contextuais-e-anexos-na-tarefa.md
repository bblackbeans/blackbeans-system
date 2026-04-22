# Story 3.8: Comentarios contextuais e anexos na tarefa

Status: done

## Story

As a Usuario autorizado,  
I want registrar comentarios e anexar arquivos na tarefa,  
so that o contexto de execucao fique centralizado e auditavel.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /tasks/{id}/comments` e `POST /tasks/{id}/attachments`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelos `TaskComment` e `TaskAttachment` implementados.
- Endpoints de comentario e anexo implementados com validações de entrada.
- Atividade de tarefa registra inclusão de comentário e anexo.
- Teste de integração cobrindo ambos os fluxos.

### Review Findings

- [x] [Review][Approve] Fluxos de comentário e anexo atendem AC com rastreabilidade de autor e timestamp.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
