# Story 7.12: CRUD visual com edicao e remocao de entidades operacionais

Status: done

## Story

As a Usuario web,
I want editar e remover clientes, workspaces, portfolios e projetos diretamente na interface,
so that eu consiga manter os dados operacionais sem depender de chamadas manuais na API.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (acoes de editar/remover e atualizacao automatica das tabelas).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Adicionadas acoes de edicao e alternancia de status para clientes na tabela principal.
- Adicionadas acoes de edicao e exclusao para workspaces, portfolios e projetos.
- Adicionada atualizacao de status de projeto por acao rapida na tabela.
- Reuso de funcoes utilitarias de patch/delete com refresh de dados e boards.

### Review Findings

- [x] [Review][Patch] Garantida recarga consistente dos dados apos alteracoes CRUD.
- [x] [Review][Patch] Validado build e lint do frontend apos ampliacao de acoes.
- [x] [Review][Approve] Fluxo CRUD visual operacional pronto para homologacao.

### Change Log

- 2026-04-21: ciclo BMAD completo (create/dev/review).
