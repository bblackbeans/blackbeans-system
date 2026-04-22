# Story 2.5: CRUD de projetos vinculados a cliente e/ou portfolio

Status: done

## Story

As a Gestor,  
I want criar, editar e excluir projetos vinculados ao contexto correto,  
so that cada entrega fique conectada a cliente e estrutura de portfolio.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST/PATCH/DELETE /projects`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Projeto expandido com `client_id` opcional, status e campos de cronograma.
- Endpoints de criacao/edicao/exclusao de projeto implementados.
- Validacoes de consistencia de datas no serializer de projeto.
- Teste de integracao: `test_story_2_5_project_crud_with_client_and_portfolio`.

### Review Findings

- [x] [Review][Approve] Vinculacao de projeto com cliente e portfolio validada no serializer de escrita.
- [x] [Review][Approve] Atualizacao parcial preserva coerencia de campos e retorna envelope padronizado.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
- 2026-04-20: reexecucao estrita BMAD confirmada com teste dedicado da story.
