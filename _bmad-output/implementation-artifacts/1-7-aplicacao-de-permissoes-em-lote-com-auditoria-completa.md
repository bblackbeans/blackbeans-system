# Story 1.7: Aplicacao de permissoes em lote com auditoria completa

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want aplicar permissoes em lote para multiplos usuarios/escopos com validacao previa,  
so that eu reduza esforco operacional mantendo seguranca, consistencia e rastreabilidade.

## Acceptance Criteria

1. **Given** um admin autenticado no modulo de governanca  
   **When** ele fizer `POST /api/v1/permissions/bulk/preview` com uma lista de alteracoes em lote  
   **Then** a API deve retornar `200` com previa detalhada (itens validos, invalidos, conflitos e impacto estimado)  
   **And** nao deve persistir alteracoes de `PermissionAssignment` nessa etapa (apenas registro de preview se o desenho persistir metadados).

2. **Given** uma previa valida aprovada pelo admin  
   **When** ele fizer `POST /api/v1/permissions/bulk/apply` com o `preview_id` (ou payload assinado equivalente documentado no Dev Agent Record)  
   **Then** a API deve processar o lote com resultado por item  
   **And** deve retornar resumo com `processed`, `succeeded`, `failed` e lista de falhas.

3. **Given** itens invalidos no lote (escopo inexistente, permissao invalida, sujeito inexistente ou fora do tenant/workspace)  
   **When** o admin executar a aplicacao do lote  
   **Then** os itens invalidos devem ser rejeitados com motivo explicito por item  
   **And** os itens validos devem seguir conforme politica definida no contrato (**parcial** por defeito nesta story — ver Dev Notes).

4. **Given** aplicacao em lote concluida  
   **When** o processamento terminar  
   **Then** deve existir registro de auditoria para cada alteracao efetivada e para o comando de lote  
   **And** cada evento deve conter `actor_id`, `workspace_id`, escopo, permissao alterada e antes/depois (resumo, sem PII desnecessaria).

5. **Given** tentativa de operacao em lote por usuario sem privilegio administrativo adequado  
   **When** ele fizer `POST /api/v1/permissions/bulk/preview` ou `POST /api/v1/permissions/bulk/apply`  
   **Then** a API deve retornar `403` com envelope de erro padronizado e `correlation_id`  
   **And** nenhuma alteracao deve ser aplicada.

6. **Given** `preview_id` expirado, inexistente ou ja aplicado  
   **When** o admin fizer `POST /api/v1/permissions/bulk/apply`  
   **Then** a API deve retornar erro adequado (`404` + `preview_not_found` ou `409` + `preview_expired` / `preview_already_applied` — alinhar ao padrao 1.4/1.5) com `correlation_id`  
   **And** nao deve alterar atribuicoes.

## Tasks / Subtasks

- [x] Modelo e persistencia de preview (AC: 1, 6)
  - [x] Introduzir modelo `PermissionBulkPreview` (ou nome equivalente) em `governance`: `id` UUID, `workspace` FK, `created_by` FK `User`, `status` (`pending` | `applied` | `expired`), `expires_at` (DateTime), `items_json` (JSONField com lista normalizada de itens), `summary_json` (JSONField opcional com contagens pre-calculadas), `created_at`/`updated_at`.
  - [x] Definir TTL de expiracao (ex.: 1 hora) e limpeza opcional (fora do MVP: job Celery); para testes, expiracao curta configuravel via settings ou constante.
  - [x] Garantir que `preview` nao escreve `PermissionAssignment` ate `apply`.
- [x] Servico de validacao de itens em lote (AC: 1, 3, 6)
  - [x] Reutilizar `scope_belongs_to_workspace`, `PERMISSION_KEYS`, validacao de `User` e mesmas regras de `POST /permissions/assignments` da story 1.6.
  - [x] Classificar cada item em `valid` | `invalid` com `reason_code` / `message`; detetar conflitos previstos (opcional: reutilizar logica de `build_conflict_preview` por item ou simplificar para aviso sem bloquear preview).
- [x] API `POST /api/v1/permissions/bulk/preview` (AC: 1, 5, 6)
  - [x] Corpo: `workspace_id` + `items[]` (cada item: `subject_type`, `subject_id`, `scope_type`, `scope_id`, `permission_key`, `effect`).
  - [x] JWT + **mesma politica MVP da 1.6 para mutacoes sensiveis** — nesta story: **`IsSuperuser`** para `bulk/preview` e `bulk/apply` (simetria com `assignments`/`conflicts/resolve`); documentar no Dev Agent Record se o produto quiser staff apenas em preview.
  - [x] Resposta `200` com `data.preview_id`, `data.valid_items`, `data.invalid_items`, `data.conflicts` (se existir), `data.summary` (totais), `meta.expires_at`.
  - [x] Log `iam.permission.bulk_preview_created` com `actor_id`, `correlation_id`, `workspace_id`, `preview_id`, contagens (sem lista completa de PII se evitavel).
- [x] API `POST /api/v1/permissions/bulk/apply` (AC: 2–4, 5, 6)
  - [x] Corpo: `preview_id` (UUID); opcional `mode` com valor fixo `partial` (default) reservado para futura extensao `all_or_nothing`.
  - [x] Transacao: marcar preview `applied` apos sucesso; rejeitar se `expired` ou `applied`.
  - [x] Por item valido na snapshot do preview: `update_or_create` em `PermissionAssignment` (mesma unicidade da 1.6); agregar resultado em `succeeded` / `failed` com motivo.
  - [x] Log por item `iam.permission.assigned` (reutilizar mensagem existente) + log agregado `iam.permission.bulk_applied` com `preview_id`, totais, `actor_id`, `workspace_id`.
- [x] Testes de integracao (AC: 1–6)
  - [x] `obtain_admin_access_token` com superuser; staff nao-super recebe `403` em preview e apply.
  - [x] Preview com mistura valida/invalida; apply parcial com resumo esperado; `preview_not_found` / `preview_already_applied`.
  - [x] Regressao: suites `auth`, `users`, `collaborators`, `permissions` (1.6) verdes.

## Dev Notes

- **Depende da 1.6:** `PermissionAssignment`, `Workspace`, hierarquia de escopo, `governance/services/permissions.py`, `permissions_views.py` / serializers, `IsSuperuser`, envelopes e codigos de erro existentes.
- **Politica de lote (MVP):** **`partial`** — itens validos sao aplicados mesmo havendo invalidos; itens invalidos aparecem em `failed` com motivo. **Nao** implementar `all_or_nothing` nesta story salvo tempo sobrar; se implementar, documentar contrato `mode` e testes.
- **Payload assinado:** se nao implementar assinatura HMAC do payload na V1, persistir apenas `preview_id` e considerar `apply` idempotente por preview ja `applied` (409).
- **Conflitos no preview:** o epic menciona "conflitos" na previa; pode ser lista vazia na V1 se a resolucao automatica nao for exigida — documentar decisao no Dev Agent Record.
- **Tamanho do lote:** definir limite maximo de itens (ex.: 500) para evitar abuso; retornar `validation_error` acima do limite.

### Technical Requirements

- Prefixo `/api/v1/...`, JSON `snake_case`, envelopes, `correlation_id`, header `X-Correlation-ID` (`responses.py`, `get_correlation_id`).
- Novos codigos de erro sugeridos: `preview_not_found`, `preview_expired`, `preview_already_applied`, reutilizar `workspace_not_found`, `forbidden`, `validation_error`.

### Architecture Compliance

- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns] REST versionado, auditoria em mutacoes criticas.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns] Recursos em plural (`/permissions/bulk/...`).

### Library / Framework Requirements

- Django 6.x, DRF, SimpleJWT.
- `pytest` + `APIClient`.

### File Structure Requirements

- Estender `blackbeans_api/governance/models.py` + migracao.
- Servico dedicado `governance/services/bulk_permissions.py` (ou extensao de `permissions.py` se preferir ficheiro unico — **evitar** ficheiro >400 linhas sem necessidade).
- Views/serializers em `blackbeans_api/api/permissions_*` e URLs **antes** de rotas genericas se necessario (`permissions/bulk/...` ja e prefixo unico).

### Testing Requirements

- Cobrir preview + apply feliz, apply idempotente/duplicado, expiracao (mock de tempo ou `expires_at` no passado via update em teste).
- Garantir que `apply` nao processa item que na snapshot era `invalid`.

### Project Structure Notes

- Nao duplicar validacao de item entre view e servico: uma funcao `validate_bulk_item(...)` testavel.

### Exemplos de payload (referencia)

**`POST /api/v1/permissions/bulk/preview`:**

```json
{
  "workspace_id": "660e8400-e29b-41d4-a716-446655440000",
  "items": [
    {
      "subject_type": "user",
      "subject_id": 10,
      "scope_type": "workspace",
      "scope_id": "660e8400-e29b-41d4-a716-446655440000",
      "permission_key": "tasks.read",
      "effect": "allow"
    }
  ]
}
```

**`POST /api/v1/permissions/bulk/apply`:**

```json
{
  "preview_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.7]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns, Authentication & Security]
- [Source: `_bmad-output/implementation-artifacts/1-6-painel-rbac-por-escopo-com-resolucao-de-conflitos.md`]
- [Source: `blackbeans-api/blackbeans_api/governance/services/permissions.py`]
- [Source: `blackbeans-api/blackbeans_api/api/permissions_views.py`]

## Dev Agent Record

### Agent Model Used

Cursor agent (Composer).

### Debug Log References

### Implementation Plan

- Conflitos na previa: para cada item **valido**, chama-se `build_conflict_preview`; entradas em `data.conflicts` apenas quando `conflict` nao e nulo (informativo, nao bloqueia preview nem apply).
- Apply: V1 sem HMAC; idempotencia por `preview_id` ja `applied` (409 `preview_already_applied`). Staff so le matriz/preview de conflitos; **bulk preview/apply** exigem **superuser** (alinhado a `assignments` e `conflicts/resolve`).
- **Code review (2026-04-17):** `POST /permissions/bulk/apply` so pode ser executado pelo mesmo utilizador que criou o registo (`created_by`); outros superusers recebem `403` + `forbidden`.

### Completion Notes List

- Modelo `PermissionBulkPreview`, migracao `0002_permission_bulk_preview`, settings `BULK_PERMISSIONS_MAX_ITEMS` e `BULK_PERMISSIONS_PREVIEW_TTL_SECONDS`.
- Servico `governance/services/bulk_permissions.py` com `validate_bulk_item`, `classify_items_for_preview`, `create_preview_record`, `apply_bulk_preview`.
- Endpoints `POST /api/v1/permissions/bulk/preview` e `POST /api/v1/permissions/bulk/apply`, serializers e URLs registadas.
- Testes de integracao em `test_permissions_api.py` e unidade em `governance/tests/test_bulk_permissions.py`.
- Regressao: `test_auth_tokens_api`, `test_users_api`, `test_collaborators_api`, `test_permissions_api` (50 testes) passam em Docker.

### File List

- `blackbeans-api/blackbeans_api/governance/models.py`
- `blackbeans-api/blackbeans_api/governance/migrations/0002_permission_bulk_preview.py`
- `blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py`
- `blackbeans-api/blackbeans_api/governance/tests/test_bulk_permissions.py`
- `blackbeans-api/blackbeans_api/api/permissions_serializers.py`
- `blackbeans-api/blackbeans_api/api/permissions_views.py`
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/tests/integration/test_permissions_api.py`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-7-aplicacao-de-permissoes-em-lote-com-auditoria-completa.md`

### Change Log

- Story gerada pelo workflow `bmad-create-story` (2026-04-18). Ultimate context engine analysis completed - comprehensive developer guide created.
- Implementacao dev-story 1.7 (2026-04-17): bulk preview/apply, modelo, servico, testes e sprint em `review`.
- Code review (2026-04-17): registadas findings em `### Review Findings` (workflow `bmad-code-review`).
- Pos-code review (2026-04-17): implementada restricao `bulk/apply` ao `created_by` (decisao utilizador opcao 1).
- Code review follow-up (2026-04-20): patches tecnicos aplicados em `bulk_permissions`/`permissions_views` com testes cobrindo payload corrompido, contabilizacao de falhas por item e estado invalido de preview.

### Review Findings

- [x] [Review][Decision] Restringir `POST /permissions/bulk/apply` ao utilizador que criou o preview (`created_by`)? — **Resolvido (2026-04-17): opcao 1** — `apply` exige `request.user == preview.created_by`; caso contrario `403` + `forbidden` + `correlation_id`.

- [x] [Review][Patch] Funcao `_max_items()` definida mas nunca usada — duplicar limite no serializer apenas; remover funcao ou invocar em `classify_items_for_preview` como defesa em profundidade. [`blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py:28-29`] — **resolvido** (funcao removida).

- [x] [Review][Patch] Mensagem `unsupported_subject_type`: corrigir portugues (`... e suportado.` -> `... é suportado.`). [`blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py:54`] — **resolvido**.

- [x] [Review][Patch] `apply_bulk_preview` assume chaves obrigatorias em cada linha de `items_json`; payload corrompido/tampered sem schema pode gerar `KeyError`/`ValueError` (500). Validar estrutura minima (`version`, `items`, campos por linha) ou capturar e devolver `validation_error`/`409` conforme politica. [`blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py:152-181`] — **resolvido** (`InvalidPreviewPayloadError` + tratamento `preview_invalid_state`).

- [x] [Review][Patch] AC4 (auditoria antes/depois): logs `iam.permission.assigned` em bulk nao incluem resumo do estado anterior nem o flag `created` de `update_or_create`; alinhar com intencao de rastreabilidade (ex. logar `created` + `assignment_id` + `effect` ja existentes). [`blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py:174-199`] — **resolvido** (`before_effect`, `after_effect`, `created`, `assignment_id`).

- [x] [Review][Patch] Ramo `preview.status != PENDING` devolve `preview_expired` e mensagem generica — confunde com TTL; usar codigo distinto (ex. `preview_invalid_state`) ou alinhar mensagem ao estado real. [`blackbeans-api/blackbeans_api/api/permissions_views.py:467-474`] — **resolvido** (`preview_invalid_state`; `expires_at` agora marca status `EXPIRED`).

- [x] [Review][Defer] N+1 consultas em `classify_items_for_preview` (validacao + `build_conflict_preview` por item) — pre-existente em padrao de API sincrona; otimizar com prefetch/bulk lookup se o limite de 500 for stress real. [`blackbeans-api/blackbeans_api/governance/services/bulk_permissions.py:71-139`] — deferred, melhoria de performance

- [x] [Review][Defer] Superuser A aplicar preview criado por superuser B — **obsoleto** apos decisao [Decision] (apply restrito ao criador).

## Previous Story Intelligence

- [Source: `1-6` implementacao] `IsSuperuser` em mutacoes criticas de permissoes; staff le matriz e `conflicts/resolve-preview`. Para **bulk**, a story assume **superuser em preview e apply** ate decisao de produto alargar preview a staff.
- [Source: `1-6`] Reutilizar `PermissionAssignment.objects.update_or_create` com os mesmos campos de unicidade; logs `iam.permission.*` com `actor_id` + `correlation_id` + `workspace_id`.
- [Source: `1-6` code review] Tratar expiracao/estado de recurso auxiliar explicitamente para evitar 500 em caminhos felizes.

## Latest Tech Information

- Django `JSONField` + migracoes aditivas adequados para snapshot de preview; usar `transaction.atomic` no `apply` com `select_for_update` no registo de preview para evitar dupla aplicacao.

## Project Context Reference

- Nenhum `project-context.md` no repo; seguir `architecture.md` e esta story.
