# Story 3.3: Visualizacao de board em lista, kanban e timeline

Status: done

## Story

As a Usuario autorizado,  
I want alternar entre modos lista, kanban e timeline no board,  
so that eu acompanhe trabalho no formato mais adequado para analise e decisao.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /boards/{id}?view=list|kanban|timeline`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de detalhe de board com visualizacoes list/kanban/timeline implementado.
- Timeline restrita por permissao de perfil (superuser), com retorno `403` para perfil sem permissao.
- Testes cobrindo list, kanban e bloqueio de timeline para perfil nao autorizado.

### Review Findings

- [x] [Review][Approve] Estrutura de payload por view permite renderizacao consistente no frontend.
- [x] [Review][Approve] Bloqueio de timeline atende requisito de permissao.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
