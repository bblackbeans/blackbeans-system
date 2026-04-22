# Story 7.15: Modais padrao e ativacao 2FA com QR no perfil

Status: done

## Story

As a Usuario web,
I want ativar 2FA com QR code em modal e executar edicoes/exclusoes por modais consistentes,
so that a UX fique padronizada e sem prompts nativos do navegador.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (modais para 2FA, edicao e exclusao).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Adicionado modal de setup 2FA com QR code, chave manual e confirmacao de codigo.
- Substituidos `prompt/confirm/alert` por modais Ant Design para acoes de editar/excluir.
- Removido uso de `List` e ajustados componentes deprecados (`Drawer size`, `Space orientation`).
- Criada aba de `Perfil` no menu com bloco de ativacao de 2FA por QR.

### Review Findings

- [x] [Review][Patch] Eliminados warnings deprecados visiveis no navegador.
- [x] [Review][Patch] Mantida compatibilidade com fluxo de login e endpoints atuais.
- [x] [Review][Approve] Frontend mais consistente para homologacao.

### Change Log

- 2026-04-21: ciclo BMAD completo (create/dev/review).
