---
title: 'Liberar áreas da Administração para colaborador'
type: 'feature'
created: '2026-09-09'
status: 'done'
baseline_commit: '537a88f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Colaboradores (`is_staff=false`) não veem nenhuma área do submenu Administração. Às vezes o admin precisa liberar só algumas (ex.: Banco de leads) sem tornar o usuário admin completo.

**Approach:** Na edição/criação do usuário colaborador, o admin marca áreas da Administração. Só essas áreas aparecem no menu do colaborador e as APIs correspondentes aceitam o acesso; sem liberação, a área não aparece e a API responde 403.

## Boundaries & Constraints

**Always:**
- Espelhar o padrão de `UserWorkspaceAccess` (tabela + GET/PUT replace-all + `GET /me/...`).
- Áreas liberáveis = itens do submenu Administração: `clients`, `client-requests`, `services`, `sales`, `users`, `status-config`, `stats`, `problems`, `agents`, `leads`.
- Admin (`is_staff`/`is_superuser`) continua vendo e acessando tudo; grants só se aplicam a não-admin.
- Ao promover usuário a admin, limpar grants de área (como já limpa workspace access).
- Menu, `navigateTo`/hash e painéis usam a mesma regra: `isAdmin || grantedAreas.has(key)`.
- APIs de cada área liberada devem aceitar staff **ou** grant daquela key (senão o menu abre e a API quebra).

**Ask First:**
- Incluir no multi-select itens fora do submenu Administração (`task-intake`, `workspaces`, `admin-ops`, `admin-settings`).

**Never:**
- Não promover `is_staff` parcial nem reutilizar governance `PermissionAssignment` (escopo diferente).
- Não deixar colaborador sem grant ver item no menu ou chamar a API da área.
- Não alterar a feature de workspace access existente.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Admin salva colaborador com `area_keys: ["leads"]` | Persistido; colaborador vê só Banco de leads em Administração; APIs `/leads*` OK | N/A |
| Sem grants | Colaborador sem áreas | Submenu Administração oculto (ou vazio); hash `#leads` redireciona dashboard | API leads → 403 |
| Exceto/incluir multi | Admin grava lista completa no PUT | Replace-all: só as keys enviadas ficam | Keys inválidas → 400 |
| Target é admin | PUT admin-area-access em user `is_staff` | Recusado | 400 com código claro |
| Promote to admin | PATCH `is_staff=true` | Grants de área apagados | N/A |
| Me endpoint | Staff chama `/me/admin-area-access` | `{ all: true, area_keys: [] }` | N/A |
| Me endpoint | Colaborador com leads | `{ all: false, area_keys: ["leads"] }` | N/A |

</frozen-after-approval>

## Code Map

- `blackbeans-api/blackbeans_api/users/models.py` -- `UserWorkspaceAccess`; criar modelo espelho de área admin
- `blackbeans-api/blackbeans_api/users/migrations/` -- nova migration
- `blackbeans-api/blackbeans_api/api/users_views.py` -- `MeWorkspaceAccessView` / `AdminUserWorkspaceAccessView`; espelhar; limpar grants no promote
- `blackbeans-api/blackbeans_api/api/users_serializers.py` -- serializer write de workspace; espelhar
- `blackbeans-api/blackbeans_api/api/urls.py` -- rotas `me/workspace-access` e `users/<id>/workspace-access`
- `blackbeans-api/blackbeans_api/api/permissions.py` -- `IsStaffOrSuperuser`; adicionar helper por `area_key`
- `blackbeans-api/blackbeans_api/api/leads_views.py` (+ demais views admin das 10 keys) -- trocar permission class
- `blackbeans-web/src/components/app-shell.tsx` -- menu, navigateTo, form Usuarios, fetch `/me/...`, gates `isAdmin` nos painéis

## Tasks & Acceptance

**Execution:**
- [x] `blackbeans-api/blackbeans_api/users/models.py` + migration -- criar `UserAdminAreaAccess(user, area_key)` unique `(user, area_key)` com allowlist das 10 keys -- persistência
- [x] `blackbeans-api/.../users_serializers.py`, `users_views.py`, `urls.py` -- GET/PUT `/users/<id>/admin-area-access` e GET `/me/admin-area-access`; limpar grants ao promover staff -- API espelho workspace
- [x] `blackbeans-api/.../permissions.py` + views das 10 áreas -- `HasStaffOrAdminArea("…")` (ou equivalente) nas views que hoje usam só `IsStaffOrSuperuser` para essas áreas -- API utilizável pelo colaborador liberado
- [x] `blackbeans-web/.../app-shell.tsx` -- carregar `/me/admin-area-access`; menu Administração parcial; navigateTo/hash/painéis; multi-select no form criar/editar colaborador (junto a workspaces); salvar via PUT -- UX e enforcement UI
- [x] Testes API (padrão do repo) -- cobrir matrix: me staff/colaborador, PUT replace-all, key inválida, target admin, leads 403 vs 200 com grant -- regressão

**Acceptance Criteria:**
- Given Bruno colaborador sem áreas, when ele loga, then nenhum item de Administração aparece e `#leads` não abre o painel.
- Given admin libera `leads` para Bruno e salva, when Bruno loga, then ele vê Administração → Banco de leads e consegue usar as APIs de leads; outras áreas admin continuam ocultas.
- Given admin remove `leads` do multi-select e salva, when Bruno atualiza a sessão/refetch, then Banco de leads some e a API volta a 403.
- Given usuário promovido a admin, when o perfil é salvo, then grants de área são limpos e ele vê o menu admin completo.

## Spec Change Log

## Design Notes

Espelhar workspace access:

```python
# PUT body
{ "area_keys": ["leads", "clients"] }

# GET /me/admin-area-access (colaborador)
{ "all": false, "area_keys": ["leads"] }

# GET /me (staff)
{ "all": true, "area_keys": [] }
```

No front, helper `canAccessAdminArea(key)` = `isAdmin || meAdminAreas.all || meAdminAreas.area_keys.includes(key)`. Submenu Administração só renderiza se existir ao menos uma área acessível. Labels do multi-select iguais aos labels do menu.

## Verification

**Commands:**
- `cd blackbeans-api && python -m pytest` (ou o comando de teste do módulo users/api usado no repo) -- testes novos passam
- Lint/typecheck do arquivo web alterado se disponível -- sem erros novos

**Manual checks:**
- Editar Bruno: marcar só Banco de leads → Salvar → login como Bruno → menu e tela de leads OK; Clientes etc. ausentes.
- Login admin → menu completo inalterado.

## Suggested Review Order

**Persistência e permissão**

- Modelo e allowlist das 10 áreas liberáveis.
  [`models.py:137`](../../blackbeans-api/blackbeans_api/users/models.py#L137)

- Staff ou grant por `area_key` em cada request.
  [`permissions.py:10`](../../blackbeans-api/blackbeans_api/api/permissions.py#L10)

- Só admin real faz PUT de grants (bloqueia escalação via grant `users`).
  [`users_views.py:477`](../../blackbeans-api/blackbeans_api/api/users_views.py#L477)

- Colaborador lê as próprias áreas no login.
  [`users_views.py:455`](../../blackbeans-api/blackbeans_api/api/users_views.py#L455)

**UI e menu**

- Catálogo espelhado no multi-select da edição.
  [`app-shell.tsx:608`](../../blackbeans-web/src/components/app-shell.tsx#L608)

- Gate único do menu/painéis.
  [`app-shell.tsx:2498`](../../blackbeans-web/src/components/app-shell.tsx#L2498)

- Campo na edição do colaborador.
  [`app-shell.tsx:8762`](../../blackbeans-web/src/components/app-shell.tsx#L8762)

**Testes**

- Matrix + anti-escalação + stats.
  [`test_admin_area_access_api.py:1`](../../blackbeans-api/tests/integration/test_admin_area_access_api.py#L1)
