---
workflowType: story
projectContext: brownfield
module: paid-media-governance
story: 1.1.1
status: ready-for-dev
date: 2026-08-27
inputDocuments:
  - _bmad-output/planning-artifacts/paid-media-governance-prd.md
  - _bmad-output/planning-artifacts/paid-media-governance-architecture.md
  - _bmad-output/planning-artifacts/paid-media-governance-epics.md
---

# Story 1.1.1 — Introduzir o domínio `paid_media`, referência lógica Composio e vínculo de conta

## História

Como administrador, quero registrar a referência lógica à futura conexão Composio de Meta do workspace e vincular uma conta de anúncio a um cliente existente, para que as próximas stories tenham ownership tenant-aware explícito e não possam misturar contas entre workspaces.

## Resultado implementável

Criar somente a fundação Django do domínio `paid_media`: app registrado, models e migration mínimos para referência lógica de provedor e vínculo de conta, invariantes de tenant, admin básico conforme o padrão atual e testes de isolamento, duplicação e desativação. Esta story não usa Composio, não conecta à Meta e não inicia coleta.

## Decisões aplicáveis

- Há no máximo uma referência lógica à conexão Composio de Meta por workspace.
- Uma conexão pode possuir vários vínculos de conta; cada vínculo pertence ao mesmo workspace da conexão e referencia um `Client` existente associado àquele workspace.
- A mesma conta Meta não pode ser vinculada duas vezes no mesmo workspace, mesmo a clientes diferentes.
- Desativação é lógica e preserva registros; conexão ou vínculo inativo fica inelegível para coletas futuras.
- Meta permanece exclusivamente read-only no MVP.
- Composio será a única camada de integração Meta: OAuth, credenciais e ciclo de tokens Meta pertencem ao Composio, e o sistema não chama Graph/Marketing API diretamente.
- Os níveis conta, campanha, conjunto de anúncios e anúncio, o backfill de 90 dias e Activities diária pertencem a stories posteriores; não geram models adicionais aqui.

## Escopo técnico

### Model mínimo: `PaidMediaConnection`

- UUID como chave primária, seguindo os agregados tenant-aware existentes.
- `workspace`: FK obrigatória para `governance.Workspace`, com exclusão protegida.
- `provider`: enum restrito a `meta` nesta fase.
- `is_active`: booleano, default `True`.
- `created_at` e `updated_at`.
- Constraint de unicidade para `(workspace, provider)`, materializando uma referência lógica Composio de Meta por workspace.
- O model representa somente a referência lógica local; identificador de conexão/conta conectada Composio, metadados sanitizados e estado de saúde serão definidos e adicionados em story posterior após a Fase 0.
- Nenhum SDK/API Composio, token, secret, credential Meta, scope, OAuth state, callback, refresh, revoke ou chamada externa nesta story.

### Model mínimo: `MetaAdAccountLink`

- UUID como chave primária.
- `workspace`: FK obrigatória para `governance.Workspace`, materializada para consultas e constraints tenant-aware.
- `client`: FK obrigatória para `clients.Client`, com exclusão protegida.
- `connection`: FK obrigatória para `PaidMediaConnection`, com exclusão protegida.
- `external_account_id`: string obrigatória, normalizada sem prefixos de apresentação quando o contrato posterior assim definir; nesta story, trim e não vazio são suficientes.
- `display_name`: string opcional para operação/admin.
- `is_active`: booleano, default `True`.
- `created_at` e `updated_at`.
- Constraint de unicidade para `(workspace, external_account_id)`; o mesmo ID pode existir em outro workspace sem colisão.

### Invariantes de tenant

- `MetaAdAccountLink.workspace_id == PaidMediaConnection.workspace_id`.
- O `Client` do vínculo deve ser o cliente associado ao `Workspace` existente (`Workspace.client_id == MetaAdAccountLink.client_id`).
- Criação e alteração devem validar as invariantes no model/service usado pela story e no Django admin; não depender somente de formulário ou UI.
- Queries auxiliares de elegibilidade, se necessárias aos testes, retornam apenas registros com conexão e vínculo ativos e sempre recebem/filtram por workspace.
- Banco garante as unicidades; validação de aplicação fornece erro compreensível para relações cross-workspace que não cabem em constraint simples entre tabelas.

## Critérios de aceite

1. Dado um workspace sem referência lógica Composio de Meta, quando uma conexão lógica `meta` é criada, então ela é persistida como ativa e uma segunda referência `meta` no mesmo workspace falha por constraint.
2. Dado outro workspace, quando uma conexão `meta` é criada nele, então não há colisão com a conexão do primeiro workspace.
3. Dada uma conexão e o cliente do mesmo workspace, quando uma conta Meta é vinculada, então o vínculo guarda explicitamente workspace, cliente, conexão e ID externo.
4. Dado o mesmo `external_account_id` no mesmo workspace, quando um segundo vínculo é tentado — inclusive para outro cliente — então a duplicação é rejeitada.
5. Dado o mesmo `external_account_id` em workspaces diferentes, quando os vínculos válidos são criados, então ambos podem existir e consultas escopadas não vazam o registro do outro tenant.
6. Dada uma conexão de outro workspace ou um cliente diferente do cliente associado ao workspace, quando o vínculo é validado/salvo pelo caminho suportado, então a operação é rejeitada.
7. Dado um vínculo ativo, quando ele é desativado, então o registro permanece no banco e deixa de aparecer como elegível para coleta futura.
8. Dada uma conexão desativada, então nenhum vínculo dessa conexão é elegível, mesmo que o próprio vínculo esteja ativo.
9. Os dois models aparecem no Django admin básico se esse registro seguir o padrão atual do backend, com busca/filtros úteis por workspace, cliente, ID externo e estado ativo.
10. A migration é determinística e `makemigrations --check --dry-run` não detecta mudanças pendentes após aplicá-la.
11. Não existe nesta entrega código/identificador de integração Composio, credencial Meta, OAuth, scope, callback, refresh, revoke, API/serializer/view/URL, frontend, job, adapter, chamada Graph/Marketing API, snapshot, activity, campanha, conjunto, anúncio ou escrita Meta.

## Testes RED → GREEN

### RED

- Escrever primeiro testes que falham porque o app/models ainda não existem.
- Cobrir unicidade de uma referência lógica Composio de Meta por workspace com `IntegrityError` no banco.
- Cobrir duplicação de `external_account_id` no mesmo workspace e permissão do mesmo ID em workspaces distintos.
- Cobrir rejeição de conexão cross-workspace e de cliente incompatível com `Workspace.client`.
- Cobrir queryset/manager de elegibilidade tenant-aware: vínculo ativo + conexão ativa; sem retorno de outro workspace.
- Cobrir desativação sem exclusão física e preservação do vínculo.

### GREEN

- Registrar o app e implementar apenas os dois models, constraints e validações mínimas necessárias para os testes passarem.
- Gerar uma única migration inicial revisável.
- Registrar admin básico somente se mantiver o padrão observado nos apps existentes.
- Fazer passar a suíte focada sem afrouxar os casos negativos ou introduzir integração externa.

## Arquivos prováveis

- `blackbeans-api/blackbeans_api/paid_media/__init__.py`
- `blackbeans-api/blackbeans_api/paid_media/apps.py`
- `blackbeans-api/blackbeans_api/paid_media/models.py`
- `blackbeans-api/blackbeans_api/paid_media/admin.py`
- `blackbeans-api/blackbeans_api/paid_media/migrations/__init__.py`
- `blackbeans-api/blackbeans_api/paid_media/migrations/0001_initial.py`
- `blackbeans-api/blackbeans_api/paid_media/tests/__init__.py`
- `blackbeans-api/blackbeans_api/paid_media/tests/test_models.py`
- `blackbeans-api/config/settings/base.py`

Não alterar arquivos de frontend. Evitar factories globais nesta story; fixtures/factories locais ao teste são suficientes, salvo padrão obrigatório encontrado durante a implementação.

## Fora de escopo

- SDK/API/adapter Composio, identificador de conta conectada/conexão, metadados remotos e estado de saúde.
- Credenciais Meta, OAuth, scopes, callback, refresh, revogação e uso do singleton `IntegrationCredential` existente; todo esse ciclo Meta pertence ao Composio.
- Chamadas à Graph/Marketing API, chamadas ao Composio ou qualquer acesso de rede.
- Endpoints REST, serializers, views, URLs, RBAC/capabilities e auditoria — cobertos por stories posteriores.
- Jobs Celery/beat, sync runs, retries, checkpoints ou elegibilidade operacional completa.
- Models/projeções de campanha, conjunto de anúncios ou anúncio.
- Insights, métricas, snapshots e backfill de 90 dias.
- Meta Activities e sua persistência diária.
- Planejamento/KPI e integração com `black-beans-knowledge`.
- Recomendações, aprovação de Fagner, tarefas, notificações, frontend e migrations de qualquer outro domínio.
- Instalação ou atualização de dependências.

## Comandos de verificação

Executar a partir de `blackbeans-api/`, usando o ambiente já provisionado no projeto e sem instalar dependências:

```bash
pytest blackbeans_api/paid_media/tests/test_models.py
python manage.py makemigrations --check --dry-run
python manage.py check
ruff check blackbeans_api/paid_media config/settings/base.py
```

Opcionalmente, após a suíte focada ficar verde:

```bash
pytest blackbeans_api/paid_media/tests
```

## Definition of Done

- Testes RED foram registrados antes da implementação e todos ficam GREEN.
- Migration inicial, constraints e validações representam exatamente as invariantes acima.
- `git diff` não contém backend/frontend além dos arquivos prováveis necessários à story quando ela for implementada.
- Nenhuma dependência foi instalada, nenhuma rede foi acessada e nenhuma operação Composio/Meta foi criada.
