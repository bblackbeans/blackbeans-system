# Story 1.6: Painel RBAC por escopo com resolucao de conflitos

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Admin/Superusuario,  
I want visualizar e ajustar permissoes por escopo (`workspace`, `portfolio`, `project`, `board`) em um painel centralizado,  
so that eu garanta acesso correto e rastreavel sem inconsistencias entre regras herdadas e especificas.

## Acceptance Criteria

1. **Given** um admin autenticado com acesso ao modulo de governanca  
   **When** ele fizer `GET /api/v1/permissions/matrix?workspace_id={uuid}` com filtros opcionais (`user_id`, `scope_type`, `scope_id`) quando aplicavel  
   **Then** a API deve retornar `200` com a matriz de permissoes vigente por escopo  
   **And** cada entrada deve indicar `rule_source` como `inherited` ou `specific` (e metadados suficientes para o painel: sujeito, escopo, `permission_key`, `effect` efetivo).

2. **Given** uma permissao especifica a ser aplicada num escopo  
   **When** o admin fizer `POST /api/v1/permissions/assignments` com corpo valido contendo `subject_type`, `subject_id`, `scope_type`, `scope_id`, `permission_key`, `effect` (`allow` | `deny`)  
   **Then** a API deve criar ou atualizar a regra explicita (upsert por criterio unico definido no modelo) e retornar `201` ou `200` conforme criacao vs atualizacao, em envelope padrao  
   **And** a autorizacao efetiva usada por verificacoes subsequentes (funcao/servico de resolucao) deve refletir a alteracao imediatamente apos commit.

3. **Given** um conflito entre regra herdada e regra especifica (ou duas linhas de decisao incompativeis na mesma avaliacao)  
   **When** o admin solicitar validacao via `POST /api/v1/permissions/conflicts/resolve-preview` com payload que identifique o conflito (ver contrato na secao Dev Notes)  
   **Then** a API deve retornar `200` com o conflito detectado, impacto resumido e **lista de opcoes** de resolucao suportadas  
   **And** cada opcao deve deixar explicito qual regra prevalece apos aplicacao (antes/depois conceitual).

4. **Given** um conflito confirmado pelo admin  
   **When** ele aplicar a escolha em `POST /api/v1/permissions/conflicts/resolve` com referencia a opcao e dados minimos para persistir  
   **Then** a API deve persistir a resolucao escolhida e retornar estado final coerente (envelope `data`)  
   **And** deve registrar evento de auditoria estruturado com `actor_id`, `workspace_id`, tipo de decisao e resumo antes/depois (sem dados sensiveis).

5. **Given** uma tentativa de atribuir permissao fora do escopo administrativo permitido ao ator (politica de governanca — ver Dev Notes para MVP)  
   **When** o admin fizer operacao de criacao/edicao de regra (`POST /assignments` ou `POST /conflicts/resolve`)  
   **Then** a API deve retornar `403` com envelope de erro padronizado e `correlation_id`  
   **And** nenhuma alteracao deve ser persistida.

6. **Given** `workspace_id` inexistente ou `scope_id` invalido para o `scope_type` indicado  
   **When** qualquer endpoint acima for chamado com esses identificadores  
   **Then** a API deve retornar `404` com codigo de erro explicito (`workspace_not_found`, `scope_not_found` ou equivalente alinhado ao padrao 1.4/1.5) e `correlation_id`.

## Tasks / Subtasks

- [x] Modelagem de escopo e atribuicoes (AC: 1, 2, 6)
  - [x] Criar app Django dedicado (ex.: `governance`) registado em `INSTALLED_APPS`, com migracoes iniciais.
  - [x] Modelo `Workspace` minimo (`id` UUID, `name`, timestamps) — **stub de governanca** ate o Epic 2 enriquecer; nao duplicar regras de negocio de cliente/workspace operacional alem do necessario para RBAC.
  - [x] Modelos de hierarquia **minimos** para validar `scope_id` quando `scope_type` for `portfolio` | `project` | `board`: cadeia de FKs (`Portfolio.workspace`, `Project.portfolio`, `Board.project`) com campos essenciais (`id` UUID, relacoes, `name` opcional). Garantir que `workspace_id` passado na matriz filtre atribuicoes fora desse workspace (integridade multi-tenant logica).
  - [x] Modelo `PermissionAssignment` (ou nome alinhado ao dominio) com: referencia ao sujeito (`subject_type` string + `subject_id` — MVP com `subject_type=user` e `subject_id` inteiro FK/logica para `User`), `workspace_id` (FK `Workspace` para filtro rapido), `scope_type`, `scope_id` (UUID), `permission_key` (string), `effect` (`allow`|`deny`), timestamps; **constraint de unicidade** para upsert (ex.: mesmo user + scope + permission_key).
  - [x] Camada de servico para **calcular permissao efetiva** e classificar cada célula da matriz como `inherited` vs `specific` (regra documentada no Dev Agent Record apos implementacao).
- [x] API `GET /api/v1/permissions/matrix` (AC: 1, 5, 6)
  - [x] Autenticacao JWT + `IsStaffOrSuperuser` (mesmo padrao 1.4/1.5).
  - [x] Query obrigatoria `workspace_id` (UUID); opcionais: `user_id`, `scope_type`, `scope_id` — validar combinacoes e retornar `validation_error` quando incoerente.
  - [x] Resposta `200` com `data.matrix` (lista estruturada) + `meta` minimo (ex.: contagem); datas ISO-8601 UTC quando aplicavel.
- [x] API `POST /api/v1/permissions/assignments` (AC: 2, 5, 6)
  - [x] Validar existencia de `Workspace`, coerencia `scope_type`/`scope_id` com a hierarquia stub.
  - [x] Suportar `subject_type`/`subject_id` (MVP: apenas usuario existente).
  - [x] Log estruturado `iam.permission.assigned` (ou nome alinhado ao padrao existente) com `actor_id`, `correlation_id`, `workspace_id`, `subject_id`, `scope_type`, `scope_id`, `permission_key`, `effect` (sem PII extra).
- [x] API `POST /api/v1/permissions/conflicts/resolve-preview` e `POST .../resolve` (AC: 3, 4, 5, 6)
  - [x] Definir contrato JSON do preview (entrada/saida) no codigo + exemplos na story Dev Agent Record apos implementacao.
  - [x] Persistencia da resolucao em `POST .../resolve` (pode ser modelo auxiliar `PermissionConflictResolution` ou campos em `PermissionAssignment` — escolher uma e documentar).
  - [x] Log de auditoria em `resolve`: `iam.permission.conflict_resolved` com antes/depois resumido.
- [x] Autorizacao "fora do escopo do admin" (AC: 5)
  - [x] Implementar politica **MVP** clara: ex. apenas `is_superuser` pode mutar **ou** staff pode mutar apenas workspaces onde ja existe alguma atribuicao criada por superuser — **escolher uma politica simples**, documentar no Dev Agent Record e testar `403` com codigo `forbidden` (ou `permission_denied` se alinhado ao `architecture.md`).
- [x] Testes de integracao (AC: 1–6)
  - [x] `obtain_admin_access_token` para fluxos admin; casos `403` para staff sem privilegio (conforme politica MVP).
  - [x] Matrix vazia e matrix com heranca + especifico; preview e resolve feliz; erro `workspace_not_found` / `scope_not_found`.
  - [x] Regressao: suites existentes de `auth` e `users`/`collaborators` permanecem verdes.

## Dev Notes

- **Dependencias:** stories **1.3** (2FA admin), **1.4** (usuarios), **1.5** (colaborador/perfil). Reutilizar `responses.py`, `exceptions.py`, `get_correlation_id`, `IsStaffOrSuperuser`, `tests/integration/auth_helpers.py`.
- **Epic 2 ainda nao implementa** CRUD rico de cliente/workspace operacional; este epic **introduz** `Workspace` stub **apenas** para suportar RBAC e `workspace_id` obrigatorio na arquitetura. Epic 2 deve **estender** o mesmo modelo (migracoes aditivas) em vez de criar segundo tipo de "workspace".
- **OpenAPI:** se `drf-spectacular` ainda nao estiver no projeto, nao bloquear; opcional follow-up.
- **Resolucao de conflitos:** o produto espera UX hibrida (drawer vs tela dedicada); nesta story o contrato e **API** — retornar opcoes suficientemente claras para o frontend futuro.
- **Performance:** matriz pode crescer; para MVP aceitar O(n) em Python com queryset moderado; indexar `(workspace_id, subject_id)` e campos de escopo.

### Technical Requirements

- Prefixo `/api/v1/...`, JSON `snake_case`, envelopes de sucesso/erro, `correlation_id` e header `X-Correlation-ID` alinhados a `blackbeans_api/api/responses.py`.
- Codigos de erro novos sugeridos: `workspace_not_found`, `scope_not_found`, `subject_not_found`, `permission_denied` (ou reutilizar `forbidden` de DRF ja mapeado — **manter consistencia** com handlers existentes).
- `permission_key`: definir conjunto **fechado** inicial (enum/constants em codigo) para evitar strings arbitrarias na V1; documentar lista no Dev Agent Record.

### Architecture Compliance

- [Source: `_bmad-output/planning-artifacts/architecture.md` - Authentication & Security] RBAC por escopo hierarquico; multi-tenant logico com `workspace_id`.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - API & Communication Patterns] REST versionado, envelopes, erros padronizados.
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Naming Patterns] Endpoints em plural sob `/permissions/...`, query params `snake_case`.

### Library / Framework Requirements

- Django 6.x, DRF, SimpleJWT (existentes).
- `pytest` + `APIClient` para integracao.

### File Structure Requirements

- Novo app `governance` (ou nome aprovado pelo time) em `blackbeans-api/blackbeans_api/governance/` com `models.py`, `services/` (resolucao efetiva + conflitos), `api` ou views em `blackbeans_api/api/permissions_*.py` — **uma** convencao clara; registrar URLs em `blackbeans_api/api/urls.py`.
- Nao colocar regras de negocio de RBAC espalhadas em views grossas: extrair servico testavel.

### Testing Requirements

- Cobrir todos os ACs com chamadas HTTP reais.
- Usar factories para `Workspace` + hierarquia minima + `User` + atribuicoes.
- Incluir pelo menos um teste de **regressao** importando fluxo admin existente (2FA) para garantir que permissoes nao quebram autenticacao.

### Project Structure Notes

- O `architecture.md` sugere app `governance`; se o repositorio ja tiver outro nome padronizado, seguir o existente e atualizar esta story no Dev Agent Record.
- Evitar dependencia circular: `governance` pode referenciar `users.User` via `settings.AUTH_USER_MODEL` ou FK direto conforme padrao do projeto.

### Exemplos de payload (referencia — ajustar ao contrato final)

**`POST /api/v1/permissions/assignments`:**

```json
{
  "subject_type": "user",
  "subject_id": 42,
  "scope_type": "workspace",
  "scope_id": "660e8400-e29b-41d4-a716-446655440000",
  "permission_key": "tasks.read",
  "effect": "allow"
}
```

**`POST /api/v1/permissions/conflicts/resolve-preview` (forma sugerida):**

```json
{
  "workspace_id": "660e8400-e29b-41d4-a716-446655440000",
  "context": {
    "subject_type": "user",
    "subject_id": 42,
    "scope_type": "project",
    "scope_id": "770e8400-e29b-41d4-a716-446655440001",
    "permission_key": "tasks.write"
  }
}
```

Resposta esperada (conceito): `data.conflict`, `data.resolution_options[]` cada uma com `option_id`, `label`, `effective_rule_summary`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Story 1.6]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Authentication & Security, API & Communication Patterns, Naming Patterns]
- [Source: `_bmad-output/implementation-artifacts/1-5-gestao-de-colaborador-departamento-e-perfil-proprio.md`]
- [Source: `blackbeans-api/blackbeans_api/api/users_views.py` — padrao admin + logs]
- [Source: `blackbeans-api/blackbeans_api/api/collaborators_views.py` — padrao admin + envelopes]

## Dev Agent Record

### Agent Model Used

Composer (dev-story 1.6)

### Debug Log References

- `docker compose -f infra/docker-compose.dev.yml exec api uv run python manage.py makemigrations governance --name initial_rbac`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run python manage.py migrate --noinput`
- `docker compose -f infra/docker-compose.dev.yml exec api uv run pytest tests/integration/ -q` — 37 passed (2026-04-17); pos code review patches — 39 passed (2026-04-17).

### Completion Notes List

- Story 1.6: primeira fatia de **RBAC por escopo** com matriz, atribuicoes, preview/resolucao de conflitos e auditoria; depende de stubs de `Workspace` e hierarquia minima ate Epic 2/3 alinharem dominio operacional.
- **Politica MVP (AC5):** `POST /api/v1/permissions/assignments` e `POST /api/v1/permissions/conflicts/resolve` exigem `IsSuperuser` (alem de staff autenticado). `GET /permissions/matrix` e `POST /permissions/conflicts/resolve-preview` permitem qualquer `is_staff` (painel + preview).
- **Resolucao efetiva:** percorre a cadeia do escopo alvo ate o `workspace` (mais especifico primeiro); primeira `PermissionAssignment` encontrada define `effective_effect`; `rule_source` e `specific` se a linha vencedora e exatamente o escopo da linha da matriz, senao `inherited`.
- **`permission_key` fechado:** `tasks.read`, `tasks.write`, `boards.read`, `boards.write` (constante em `governance/services/permissions.py`).
- **Preview de conflito:** corpo exige `proposed.effect`; compara efeito atual com simulacao de upsert no mesmo escopo; opcoes `apply_proposed` e `keep_current`.
- **Auditoria de resolve:** modelo `PermissionConflictResolution` + log `iam.permission.conflict_resolved`.

### File List

- `_bmad-output/implementation-artifacts/1-6-painel-rbac-por-escopo-com-resolucao-de-conflitos.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `blackbeans-api/config/settings/base.py`
- `blackbeans-api/blackbeans_api/governance/` (app, models, migrations, services, tests/factories)
- `blackbeans-api/blackbeans_api/api/permissions_views.py`
- `blackbeans-api/blackbeans_api/api/permissions_serializers.py`
- `blackbeans-api/blackbeans_api/api/permissions.py` (`IsSuperuser`)
- `blackbeans-api/blackbeans_api/api/urls.py`
- `blackbeans-api/tests/integration/test_permissions_api.py`

### Change Log

- Story gerada pelo workflow `bmad-create-story` (2026-04-17). Ultimate context engine analysis completed - comprehensive developer guide created.
- Implementacao dev-story 1.6: app `governance`, APIs de permissoes, testes de integracao.
- Code review (2026-04-17): `build_conflict_preview` sem falso positivo quando efeito efetivo inalterado; `chain_leaf_to_workspace` com `ObjectDoesNotExist` -> `ScopeValidationError`; matriz omite atribuicoes com escopo orfao.

### Review Findings

- [x] [Review][Patch] Falso positivo em `build_conflict_preview` — quando `sim_eff == cur_eff` mas `sim_src != cur_src` (ex.: proposta `deny` igual ao efeito herdado atual), o codigo ainda devolve `conflict` e opcoes; o painel deveria tratar como sem conflito se o efeito efetivo nao muda. Ajustar condicao em `build_conflict_preview` para comparar pelo menos `sim_eff == cur_eff`. [`blackbeans-api/blackbeans_api/governance/services/permissions.py` ~191-202] — corrigido em code review (2026-04-17).
- [x] [Review][Patch] `chain_leaf_to_workspace` usa `.get(pk=...)` sem capturar `DoesNotExist` — dados inconsistentes (ex.: `PermissionAssignment` apontando para escopo apagado) geram 500 em vez de erro controlado; encapsular em `ScopeValidationError` (ou 404) alinhado a `scope_not_found`. [`blackbeans-api/blackbeans_api/governance/services/permissions.py` ~50-84] — corrigido em code review (2026-04-17); matriz ignora linhas com escopo invalido.
- [x] [Review][Defer] Leitura de matriz/preview por qualquer staff para qualquer workspace — aceite MVP; endurecer com vinculo ator↔workspace quando houver requisito de confidencialidade multi-tenant. [`blackbeans-api/blackbeans_api/api/permissions_views.py`] — adiado, ver `deferred-work.md`.

## Previous Story Intelligence

- [Source: `1-5-gestao-de-colaborador-departamento-e-perfil-proprio.md`] Padroes: `IsStaffOrSuperuser`, envelopes, codigos `*_not_found`, logs `iam.*` sem PII; testes com `RefreshToken.for_user` para nao-admin quando necessario.
- [Source: `1-5` implementacao] `collaborators_views.py` / `urls.py`: registrar rotas mais especificas antes de parametrizadas quando houver risco de colisao.

## Latest Tech Information

- Django 6.x mantem `UniqueConstraint` e transacoes `atomic()` adequados para upsert de atribuicoes; preferir `get_or_create` / `update_or_create` com cuidado a race conditions (testes de concorrencia opcionais fora do MVP).

## Project Context Reference

- Nenhum `project-context.md` encontrado no repositorio; seguir `architecture.md` e artefatos desta story.
