# Story 4.4: Consolidacao de tempo por tarefa para analise operacional

Status: done

## Story

As a Coordenador/Gestor,  
I want consultar consolidado de tempo por tarefa,  
so that eu tenha visibilidade de produtividade e previsibilidade de entrega.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /tasks/{id}/time-summary` e `GET /time-logs`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de resumo por tarefa retornando total consolidado e sessoes.
- Endpoint paginado de listagem de logs com filtros por workspace e periodo.
- `meta` da listagem inclui `total`, `page`, `page_size`, `pages`, `has_next`, `has_prev`.
- Exclusao logica respeitada nos calculos e listagens.
- Testes de integracao cobrindo consolidacao e filtragem.

### Review Findings

- [x] [Review][Patch] Incluir paginação completa no endpoint de listagem.
- [x] [Review][Approve] Consolidacao reflete alteracoes/ajustes de logs.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
