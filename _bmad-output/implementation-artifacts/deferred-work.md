# Trabalho adiado (defer)

## Deferred from: code review (`1-3-verificacao-de-2fa-obrigatoria-para-admins.md`) (2026-04-17)

- OTP gerado e armazenado no cache nao substitui um fluxo MFA completo (TOTP/WebAuthn ou canal de entrega); alinhar com django-allauth MFA ou provedor real em historia futura.
- Consumo do challenge nao usa operacao atomica compare-and-delete no cache; considerar hardening (Redis `SETNX`, lock curto ou fila) se houver requisito de seguranca sob concorrencia alta.

## Deferred from: code review (`1-4-gestao-de-usuarios-e-vinculo-com-colaborador.md`) (2026-04-17)

- Expor `POST /api/v1/collaborators` (ou fluxo equivalente) para criacao de colaboradores sem depender apenas de Django admin/seed.
- Impedir ou exigir confirmacao quando admin desativa a si mesmo via `PATCH /users/{id}`.

## Deferred from: code review of story-1.6 (`1-6-painel-rbac-por-escopo-com-resolucao-de-conflitos.md`) (2026-04-17)

- Qualquer `is_staff` pode ler `GET /permissions/matrix` e `POST /permissions/conflicts/resolve-preview` para qualquer `workspace_id` existente; restringir por pertenca do ator ao workspace/tenant (ou escopo de governanca) em historia futura se o produto exigir confidencialidade entre agencias.

## Deferred from: code review (`1-7-aplicacao-de-permissoes-em-lote-com-auditoria-completa.md`) (2026-04-17)

- N+1 consultas em `classify_items_for_preview` ao validar e calcular conflitos por item; considerar prefetch ou batch se o limite de itens for stress real em producao.
- ~~Aplicacao de bulk preview por qualquer superuser~~ **Resolvido:** apply restrito ao `created_by` (2026-04-17).
