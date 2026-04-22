# Story 2.6: Atualizacao de status e cronograma real de projetos

Status: done

## Story

As a Gestor,  
I want atualizar status e cronograma real do projeto,  
so that eu mantenha previsibilidade e comunique situacao atual da entrega.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`PATCH /projects/{id}/status` e `/schedule`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de status com validacao de valores permitidos implementado.
- Endpoint de cronograma real implementado com validacao de datas.
- Logging de auditoria operacional no update de status.
- Teste de integracao: `test_story_2_6_project_status_and_schedule`.

### Review Findings

- [x] [Review][Approve] Endpoint de status aplica conjunto fechado de valores e registra auditoria operacional.
- [x] [Review][Approve] Endpoint de cronograma valida combinacao temporal e evita datas inconsistentes.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
- 2026-04-20: reexecucao estrita BMAD confirmada com teste dedicado da story.
