# Story 3.6: Dependencias entre tarefas e recalculo de datas

Status: done

## Story

As a Usuario autorizado,  
I want definir dependencias entre tarefas com recalculo de cronograma,  
so that o plano de entrega reflita impactos reais de bloqueios e atrasos.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /tasks/{id}/dependencies` + recálculo).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `TaskDependency` implementado com unicidade por par tarefa/predecessora.
- Endpoint de dependencias implementado com validacao de ciclo simples.
- Recalculo de datas de tarefas dependentes aplicado quando relevante.
- Teste de integracao cobrindo criacao da dependencia e ajuste de data.

### Review Findings

- [x] [Review][Approve] Dependencias e recalculo minimo de cronograma implementados conforme AC.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
