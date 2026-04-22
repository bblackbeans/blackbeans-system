# Story 7.13: TaskDrawer avancado e tratamento global de erros no front

Status: done

## Story

As a Usuario web,
I want editar rapidamente campos chave da tarefa no drawer e visualizar erros globais de integracao da API,
so that eu tenha maior controle operacional sem perder contexto da tela.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (edicao rapida no drawer + banner global de erro).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Adicionado estado global de erro para exibir falhas de integracao em `Alert` dismissivel.
- Adicionada carga de grupos do board ao abrir tarefa no drawer.
- Adicionado formulario de edicao rapida no `TaskDrawer` para titulo, prioridade e grupo.
- Melhorado fallback de erro em acoes de patch/delete e acao de tarefa.

### Review Findings

- [x] [Review][Patch] Ajustado `Form` de edicao rapida com `key` por tarefa para atualizar `initialValues`.
- [x] [Review][Patch] Validado que lint e build seguem verdes apos alteracoes.
- [x] [Review][Approve] Drawer e feedback de erro prontos para uso operacional.

### Change Log

- 2026-04-21: ciclo BMAD completo (create/dev/review).
