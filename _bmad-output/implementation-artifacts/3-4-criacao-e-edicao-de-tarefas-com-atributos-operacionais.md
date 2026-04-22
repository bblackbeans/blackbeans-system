# Story 3.4: Criacao e edicao de tarefas com atributos operacionais

Status: done

## Story

As a Usuario autorizado,  
I want criar e editar tarefas com status, prioridade, cronograma e esforco,  
so that eu mantenha o trabalho planejado e rastreavel no fluxo operacional.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /tasks` e `PATCH /tasks/{id}`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Modelo `Task` implementado com atributos operacionais (status/prioridade/esforco/datas/assignee).
- Endpoints de criacao e edicao de tarefas implementados.
- Validacoes de consistencia de datas aplicadas no serializer.
- Testes de integracao para criacao e edicao aprovados.

### Review Findings

- [x] [Review][Approve] Contrato da tarefa cobre atributos operacionais exigidos no AC.
- [x] [Review][Approve] Atualizacao parcial preserva regras de validacao.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
