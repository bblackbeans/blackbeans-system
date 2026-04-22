# Story 3.9: Historico de atividade e progresso do board

Status: done

## Story

As a Coordenador/Gestor,  
I want consultar historico de atividade da tarefa e progresso agregado do board,  
so that eu acompanhe evolucao operacional e identifique gargalos rapidamente.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /tasks/{id}/activity` e `GET /boards/{id}/progress`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `TaskActivity` implementado e alimentado pelos principais eventos de tarefa.
- Endpoint de atividade da tarefa implementado com ordenação cronológica.
- Endpoint de progresso do board implementado com contagens por status e percentual.
- Testes de integração cobrindo atividade e progresso.

### Review Findings

- [x] [Review][Approve] Histórico e progresso entregam indicadores operacionais do AC.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
