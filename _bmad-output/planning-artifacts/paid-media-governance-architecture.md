---
stepsCompleted:
  - brownfield-analysis
  - domain-boundaries
  - data-architecture
  - api-and-security
  - jobs-and-connector
  - frontend-and-deployment
workflowType: architecture
projectContext: brownfield
module: paid-media-governance
status: planning
date: 2026-08-27
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/paid-media-governance-prd.md
---

# Arquitetura — Governança de Mídia Paga

## 1. Contexto e restrições

Esta arquitetura adiciona um domínio ao monólito modular existente. Não cria um app independente, outro sistema de identidade, outro banco ou outra infraestrutura de jobs.

Baseline confirmada no projeto:

- backend Django/DRF e API sob `/api/v1`;
- frontend Next.js/TypeScript consumindo a API;
- PostgreSQL como persistência operacional;
- Celery, beat e Redis para processamento assíncrono;
- entidades existentes de `Client`, `Workspace`, usuário, tarefas e notificações;
- `PermissionAssignment` para RBAC por workspace/escopo;
- `AuditLog` com ator, workspace e `correlation_id`;
- app de integrações existente, sem reutilizar seu OAuth/armazenamento de credenciais Meta para este módulo;
- Docker como padrão de empacotamento e EasyPanel como destino de produção.

O MVP integra somente Meta Ads em leitura, exclusivamente por Composio Platform. Insights e Activities entram por coleta diária. Nenhum componente terá comando, tool ou permissão de escrita em campanhas; o sistema não implementa OAuth Meta, não armazena/renova tokens Meta e não chama Graph/Marketing API diretamente.

## 2. Decisões arquiteturais

| Tema | Decisão |
|---|---|
| Forma do produto | Feature module interno ao `blackbeans-system` |
| Limite de domínio | Novo contexto `paid_media` para governança; capacidades transversais continuam nos módulos atuais |
| Tenant | `workspace_id` obrigatório em agregados operacionais; `client_id` explícito onde há vínculo de cliente |
| Fonte inicial | Connector Meta Ads via Composio, exclusivamente read-only no MVP, sem tools/operações de mutação |
| Camada de integração | SDK/API do Composio ou adapter Composio conforme padrão a fechar na Fase 0; nenhuma integração Meta direta |
| Escopo de leitura | Conta, campanha, conjunto de anúncios e anúncio |
| Conexão e vínculo | Uma referência lógica a conexão Composio de Meta por workspace; contas de anúncio vinculadas a clientes existentes |
| Coleta inicial | Backfill de 90 dias para Insights; Activities coletada diariamente e persistida |
| Persistência | PostgreSQL para configuração, jobs, snapshots, eventos, recomendações, decisões e feedback |
| Planejamento | O repositório `black-beans-knowledge` é a fonte aprovada de Git/Markdown; banco mantém referência/versão e projeção importada quando aplicável |
| Assíncrono | Celery worker + beat existentes; jobs idempotentes e checkpointados |
| API | REST versionada, envelopes e erros existentes |
| Autorização | Backend aplica RBAC existente; frontend apenas reflete capacidades |
| Auditoria | Reuso de `AuditLog`; dados volumosos de fonte ficam em tabelas próprias e não no audit log |
| Automação | Recomendação informativa; execução externa proibida no MVP |
| Aprovação | Decisões sobre orçamento, público, formulário, criativo ou status de campanha exigem aprovação explícita de Fagner |
| Deploy | Mesmos serviços Docker/EasyPanel; sem nova plataforma de dados |

## 3. Limites do domínio

### Novo domínio `paid_media`

Responsável por:

- vínculos entre workspace/cliente e contas externas de mídia;
- catálogo local mínimo de entidades externas necessárias à navegação;
- execuções de coleta e seus checkpoints;
- snapshots de performance e eventos de atividade;
- projeção/referência de planejamento e KPI aprovados;
- detecção de mudanças externas;
- geração e ciclo de vida de recomendações;
- decisões, notas e feedback interno do piloto.

### Capacidades reutilizadas

- **`users`/auth:** login, sessão/JWT e 2FA administrativo.
- **`governance`:** `Workspace`, RBAC, `AuditLog`, tarefas e notificações existentes.
- **`clients`:** identidade do cliente Reforte; não duplicar cadastro de cliente.
- **Composio Platform:** possui credenciais OAuth Meta e todo o ciclo dos tokens do provedor. O backend usa seu SDK/API ou um adapter Composio, conforme padrão decidido na Fase 0.
- **`integrations`:** pode fornecer convenções transversais de estado/erro, mas seu OAuth, cofre de credenciais e singleton `IntegrationCredential` não são usados para Meta. Os models de referência lógica Composio e vínculo Meta pertencem a `paid_media`.
- **infra:** Celery/beat, Redis, PostgreSQL, health checks, Docker e EasyPanel.

### Fronteiras obrigatórias

- Frontend nunca acessa PostgreSQL, Composio ou Meta diretamente.
- Somente o adapter Composio interpreta schemas/respostas/erros expostos pelo Composio; detalhes Meta não vazam para serviços de domínio.
- Backend não contém cliente Graph/Marketing API nem fluxo OAuth Meta; conexão, reconexão e revogação do provedor são gerenciadas pelo Composio.
- Serviços de aplicação recebem contexto de workspace e executam policy check antes de consultar ou alterar dados.
- Recomendação não chama cliente de escrita da Meta.
- Criação/vínculo de tarefa usa a API/serviço do domínio de tarefas, sem tabela paralela.
- Notificação usa o serviço existente, sem nova central.
- `AuditLog` registra ações de governança; snapshots/activities não são copiados integralmente para auditoria.

## 4. Tenant, workspace e ownership

### Regras

1. Todo vínculo de conta, documento de plano, sync run, recomendação, decisão e feedback pertence a um `Workspace`.
2. Existe no máximo uma referência lógica a conexão Composio de Meta por `Workspace`.
3. O vínculo da conta externa referencia um `Client` existente associado ao mesmo workspace; inconsistências devem ser rejeitadas.
4. Snapshot e activity herdam o workspace pelo vínculo de conta, mas também carregam `workspace_id` materializado quando necessário para enforcement, constraints e consultas. A escolha exata deve evitar escopo derivado inseguro em queries.
5. Identificadores externos nunca são usados isoladamente para lookup; toda chave/consulta inclui provedor e tenant/vínculo apropriado.
6. Jobs recebem IDs internos, reabrem o contexto no worker e repetem a validação de vínculo ativo; não confiam em `workspace_id` enviado pelo navegador.
7. Cache, locks e métricas usam namespace com workspace, provedor e conta.

### Invariantes

- Um usuário sem acesso ao workspace recebe resposta indistinguível de recurso inexistente conforme o padrão de segurança vigente.
- Uma conta Meta não pode vazar dados entre vínculos por colisão de ID externo.
- Desativar um vínculo interrompe novas coletas; não apaga histórico.
- Desconectar/revogar a conexão por meio do Composio ou desativar sua referência local não apaga snapshots, activities, recomendações ou decisões.

## 5. Modelo de dados proposto

Os nomes são propostas para implementação; serão confirmados na Fase 0 contra convenções locais e contratos/schemas expostos pelo Composio para Meta. UUID é o identificador externo do sistema, timestamps são UTC e tabelas/colunas seguem `snake_case`.

### Configuração e catálogo externo

| Model/tabela proposta | Finalidade | Campos/relações essenciais | Constraints/índices essenciais |
|---|---|---|---|
| `PaidMediaConnection` / `paid_media_connection` | Referência lógica tenant-aware à conexão Composio do provedor | `workspace_id`, `provider`, status/ativo e timestamps; identificador Composio e metadados sanitizados/estado de saúde entram em story posterior, sem credencial Meta | unique `(workspace_id, provider)`; índice por workspace/status |
| `AdAccountLink` / `paid_media_ad_account_link` | Vínculo autorizado de conta externa a workspace e cliente | `workspace_id`, `client_id`, `connection_id`, `external_account_id`, nome de exibição, moeda, timezone da conta, ativo | unique `(workspace_id, provider, external_account_id)`; índice cliente/ativo |
| `ExternalEntity` / `paid_media_external_entity` | Projeção mínima de campanha/conjunto/anúncio exigida pela UX | `workspace_id`, `ad_account_link_id`, tipo, `external_id`, parent externo/interno opcional, nome, status observado, `last_seen_at`, metadata minimizada | unique por vínculo/tipo/external_id; índice hierárquico |

Não se deve espelhar toda a Meta por padrão. O piloto lê conta, campanha, conjunto de anúncios e anúncio; `ExternalEntity` entra apenas na story de catálogo/coleta que precisar persistir essa projeção, não na fundação 1.1.1.

### Ingestão e histórico

| Model/tabela proposta | Finalidade | Campos/relações essenciais | Constraints/índices essenciais |
|---|---|---|---|
| `SyncRun` / `paid_media_sync_run` | Uma execução rastreável por conta, dataset e janela | `workspace_id`, vínculo, dataset (`insights`/`activities`), janela, status, trigger, attempts, cursor/checkpoint, contagens, erro sanitizado, `correlation_id`, início/fim | chave idempotente por vínculo/dataset/janela/versão de contrato; índices status/data |
| `PerformanceSnapshot` / `paid_media_performance_snapshot` | Observação imutável de métricas para uma entidade e período | `workspace_id`, vínculo, entidade externa, `date_start`, `date_stop`, nível, timezone, attribution/config version, `metrics`, `dimensions`, `source_fetched_at`, `sync_run_id` | chave natural/digest documentado; índices workspace/vínculo/período/nível |
| `ActivityEvent` / `paid_media_activity_event` | Evento de alteração observado na Meta | `workspace_id`, vínculo, `external_activity_id` opcional, chave determinística, tipo/categoria, entidade, actor externo se fornecido, ocorreu_em, detalhes normalizados, payload minimizado, `first_seen_at`, `sync_run_id` | unique pela identidade da fonte ou digest; índices conta/ocorreu_em/revisão |
| `ExternalChangeReview` / `paid_media_external_change_review` | Estado e nota interna de revisão sem alterar evento bruto | `workspace_id`, `activity_event_id`, status, nota, `reviewed_by`, `reviewed_at` | uma projeção atual por evento; mudanças relevantes auditadas |

Snapshots são append-only no sentido histórico: uma coleta posterior não sobrescreve observações anteriores. Se o provedor revisar métricas retrospectivamente, uma nova observação com `source_fetched_at` diferente preserva essa revisão. A política de selecionar a observação “vigente” deve ser explícita na API.

### Planejamento, recomendação e decisão

| Model/tabela proposta | Finalidade | Campos/relações essenciais | Constraints/índices essenciais |
|---|---|---|---|
| `PlanReference` / `paid_media_plan_reference` | Liga/importa planejamento aprovado | `workspace_id`, `client_id`, período, origem, caminho/identificador Git, versão, checksum, schema version, conteúdo normalizado opcional, status, `imported_by` | unique pela referência/version/checksum dentro do tenant; histórico preservado |
| `RecommendationRule` / `paid_media_recommendation_rule` | Definição versionada e explicável de regra | chave, versão, configuração validada, ativa, autoria/aprovação | estratégia global vs workspace é decisão aberta; versões imutáveis após uso |
| `Recommendation` / `paid_media_recommendation` | Sinal analisável e rastreável | `workspace_id`, vínculo/entidade, regra+versão, período, severidade, título, explicação, evidence refs/summary, status, dedupe key, timestamps | unique dedupe key no escopo; índices fila/status/período |
| `RecommendationDecision` / `paid_media_recommendation_decision` | Histórico append-only de transições e decisões | `workspace_id`, recomendação, decisão/estado, justificativa, `actor_id`, timestamp, metadata mínima | índice recomendação/timestamp; não sobrescrever histórico |
| `RecommendationTaskLink` / `paid_media_recommendation_task_link` | Liga recomendação a `Task` existente | `workspace_id`, recomendação, `task_id`, `linked_by`, timestamp | unique recomendação/task; validar mesmo workspace |
| `WeeklyFeedback` / `paid_media_weekly_feedback` | Registro interno do feedback/ritual | `workspace_id`, `client_id`, data da reunião, autor interno, resumo, relações opcionais a recomendação/período | índices cliente/data; sem usuário externo requerido |

### Dados flexíveis em JSON

JSON pode acomodar métricas/dimensões variáveis e payload minimizado, mas não substitui colunas para tenancy, identidade, tempo, status, chaves de deduplicação e filtros principais. Campos promovidos a requisito de filtro/ordenação frequente devem receber coluna e índice por migration revisada.

### Retenção e imutabilidade

- Retenções numéricas são decisão aberta da Fase 0.
- Tokens Meta nunca são persistidos pelo sistema nem integram payload histórico; credenciais do Composio permanecem somente no secret manager do ambiente.
- Payload bruto só deve ser persistido se houver finalidade, minimização e retenção aprovadas.
- Auditoria e decisões são append-only no fluxo normal.
- Exclusões administrativas, quando legalmente necessárias, exigem operação explícita e auditada; não entram no CRUD comum do MVP.

## 6. API REST proposta

Prefixo: `/api/v1/paid-media`. Mantém envelope de sucesso `{ "data": ..., "meta": ... }`, erro padronizado e `correlation_id`. Listas são paginadas e aceitam somente filtros documentados.

### Conexões e contas

| Método e rota | Uso |
|---|---|
| `GET /connections` | Listar conexões visíveis no workspace |
| `POST /connections/meta/connect` | Solicitar ao Composio o início/URL de conexão gerenciada; contrato exato é decisão da Fase 0 |
| `GET /connections/{connection_id}` | Estado de saúde e metadados sanitizados da referência Composio |
| `DELETE /connections/{connection_id}` | Solicitar desconexão/revogação via Composio e desativar referência local sem apagar histórico |
| `GET /connections/{connection_id}/available-ad-accounts` | Descoberta autorizada e limitada via tool Composio read-only |
| `GET /ad-account-links` | Listar vínculos por workspace/cliente |
| `POST /ad-account-links` | Vincular conta selecionada a cliente/workspace |
| `PATCH /ad-account-links/{link_id}` | Ativar/desativar ou alterar metadados permitidos |

### Operação e dados

| Método e rota | Uso |
|---|---|
| `GET /overview` | Resumo de atualidade, performance, alterações e recomendações |
| `GET /insights` | Série/total de performance com período, nível e filtros permitidos |
| `GET /activities` | Eventos externos paginados |
| `POST /activities/{activity_id}/review` | Registrar revisão/nota interna |
| `GET /sync-runs` | Histórico e saúde das coletas |
| `GET /sync-runs/{run_id}` | Detalhe sanitizado da execução |
| `POST /ad-account-links/{link_id}/sync-runs` | Solicitar sync/backfill autorizado e limitado |

### Plano, recomendações e feedback

| Método e rota | Uso |
|---|---|
| `GET /plans` | Listar referências/versões no escopo |
| `POST /plans/import` | Validar e registrar referência/projeção de Markdown aprovado |
| `GET /plans/{plan_id}` | Metadados, vigência e versão; não expor segredo Git |
| `GET /recommendations` | Fila filtrável e paginada |
| `GET /recommendations/{recommendation_id}` | Evidências, histórico e tarefa ligada |
| `POST /recommendations/{recommendation_id}/transitions` | Executar transição permitida com justificativa |
| `POST /recommendations/{recommendation_id}/task-link` | Ligar/criar via domínio de tarefas, conforme payload aprovado |
| `GET /weekly-feedback` | Listar registros internos |
| `POST /weekly-feedback` | Registrar feedback da reunião |

### Regras de contrato

- Workspace é resolvido pelo contexto autenticado e validado contra qualquer ID de rota/payload.
- Valores monetários não usam float; unidade/moeda acompanham resposta.
- Respostas de insights incluem `date_start`, `date_stop`, timezone, fonte, `source_fetched_at`, versão do contrato e indicador de completude/atualidade.
- Campos ausentes na Meta são `null`/não disponíveis, nunca zero inferido.
- Mutations administrativas admitem chave de idempotência quando repetição de rede puder duplicar intenção.
- OpenAPI e testes de contrato devem documentar filtros, enums, paginação e estados de erro.

## 7. RBAC

O módulo estende `PermissionAssignment`; não cria papéis paralelos. A nomenclatura final deve seguir o catálogo atual e é validada na Fase 0. Conjunto conceitual mínimo:

| Capacidade conceitual | Bárbara | Fagner | Admin de integração |
|---|---:|---:|---:|
| Ver performance/activities/recomendações | Sim, no workspace autorizado | Sim, no workspace autorizado | Sim, quando autorizado |
| Revisar alteração e analisar recomendação | Sim | Opcional | Opcional |
| Aprovar decisão sobre orçamento, público, formulário, criativo ou status de campanha | Não | Sim, aprovação explícita obrigatória | Não substitui Fagner |
| Registrar feedback interno | Sim | Sim | Conforme acesso |
| Conectar/desconectar Meta e vincular conta | Não presumido | Não presumido | Sim |
| Reprocessar job | Não presumido | Não presumido | Sim |
| Alterar regra | Fora do fluxo operacional comum; permissão restrita a definir |

Exemplos de chaves candidatas, não definitivas: `paid_media.view`, `paid_media.review`, `paid_media.approve`, `paid_media.manage_connection`, `paid_media.reprocess`, `paid_media.manage_rules`. Testes negativos por workspace, ação e objeto são gate de release.

## 8. Auditoria

Usar `AuditLog` existente com evento no padrão `domain.action`, `workspace_id`, ator quando humano, entidade, before/after minimizados, metadata e `correlation_id`.

Eventos mínimos:

- `paid_media.connection.connected|disconnected|account_scope_changed|health_changed`;
- `paid_media.ad_account_link.created|updated|disabled`;
- `paid_media.sync.requested|reprocessed` para ações humanas;
- `paid_media.activity.reviewed`;
- `paid_media.plan.imported|superseded`;
- `paid_media.recommendation.generated|transitioned|task_linked`;
- `paid_media.feedback.created|updated`.

Execuções automáticas e alto volume ficam em `SyncRun` e logs estruturados. Auditoria não recebe credenciais Composio/Meta, payload bruto completo, headers de autorização ou mensagens externas não sanitizadas.

## 9. Jobs idempotentes

### Orquestração diária

```text
Celery beat
  -> seleciona vínculos ativos e elegíveis
  -> cria/obtém SyncRun idempotente por conta + dataset + janela + contrato
  -> worker adquire lock curto por chave
  -> adapter Composio executa tools read-only com retry/backoff conforme contrato
  -> normaliza e faz upsert pela chave natural/digest
  -> persiste checkpoint e contagens por página
  -> conclui como success, partial ou failed
  -> dispara detecção/recomendação somente sobre dados confirmados
  -> notifica conforme política
```

### Garantias

- A agenda cria trabalho; não executa chamadas Composio no processo web, e nenhum processo chama Meta diretamente.
- Insights e Activities podem ter filas/runs separados para isolar falhas.
- `SyncRun` tem chave idempotente e estados explícitos (`queued`, `running`, `partial`, `succeeded`, `failed`, `cancelled`, sujeitos a confirmação).
- Lock evita concorrência, mas a integridade depende também de constraint/upsert; Redis não é a fonte de verdade.
- Cursor/checkpoint é atualizado apenas após persistência transacional da página.
- Retry ocorre apenas para classes transitórias, respeitando `Retry-After`/rate limit.
- Erros de autenticação, permissão e contrato não entram em loop de retry cego.
- Janela de lookback para capturar revisões tardias é decisão aberta e deve continuar idempotente.
- Recomendação possui `dedupe_key` baseada em workspace, regra/versão, alvo e período.
- Reprocessamento é autorizado, auditado e nunca amplia silenciosamente conta, nível ou período.

### Falhas e observabilidade

Métricas: runs por estado, duração, páginas/linhas, atraso da última coleta, retries, rate limits, estado inválido/expirado/revogado da conexão, falha de parsing, duplicata evitada e recomendações geradas. Logs incluem `correlation_id`, `sync_run_id`, workspace e IDs internos/externos sanitizados permitidos; nunca credenciais Composio/Meta.

## 10. Adapter Composio para Meta

### Interface interna

O serviço de aplicação depende de uma interface interna implementada sobre o SDK/API do Composio. Não existem cliente HTTP Meta nem chamadas Graph/Marketing API no sistema:

```text
ComposioMetaReadAdapter
  get_connection_health
  request_managed_connection / request_managed_disconnection
  list_ad_accounts
  fetch_insights(account, window, level, fields, cursor)
  fetch_activities(account, window, fields, cursor)
  classify_error
```

A interface retorna DTOs normalizados mais metadados de paginação/fonte. Schemas e erros específicos do Composio/connector ficam confinados ao adapter. Nomes reais de produto, SDK/API, IDs, toolkit/tools e chamadas não são presumidos: são descobertos e registrados na Fase 0.

### Controles

- Definir na Fase 0 se o backend usa SDK, API ou adapter Composio conforme o padrão do sistema, incluindo identidade/sessão e isolamento por workspace.
- Descobrir e registrar identificador de conta conectada/conexão, schemas das tools read-only, paginação, rate limits, timeouts e classes de erro.
- Configurar/allowlistar somente toolkit/tools de leitura necessários; nenhuma tool/operação Meta de mutação fica acessível ao módulo.
- OAuth, scopes do provedor, tokens, refresh e revogação pertencem ao Composio; o sistema apenas solicita/observa conexão e desconexão pelo contrato gerenciado.
- Persistir somente IDs e metadados sanitizados de conexão/conta e estado de saúde; nunca credenciais Meta.
- Manter segredo de acesso ao Composio somente no mecanismo de secrets do ambiente, documentando nomes/configuração sem valores no Git.
- Fixtures de contrato sanitizadas; nenhuma credencial ou dado pessoal real no repositório.
- Tratar paginação, rate limit, estado de conexão inválida/expirada/revogada, campo ausente e breaking change reportados pelo Composio.

### Insights

Os níveis fechados são conta, campanha, conjunto de anúncios e anúncio. O contrato da Fase 0 ainda define campos, breakdowns, atribuição, timezone e granularidade. A normalização deve preservar precisão decimal, moeda e diferença entre zero e indisponível.

### Activities

Disponibilidade, identidade estável, autoria e profundidade histórica devem ser comprovadas com a conta piloto. O produto só exibe o que a fonte suporta; não reconstrói “before/after” nem autoria por inferência.

## 11. Recomendações e aprovação

O MVP usa regras determinísticas, explícitas e versionadas. Cada execução grava:

- regra e versão;
- alvo e período;
- resumo das evidências e referências aos snapshots/events;
- dados/planejamento considerados;
- severidade e explicação;
- chave de deduplicação.

O workflow ainda deve detalhar os demais estados, mas deve separar pelo menos geração, análise e decisão. Alterar regra cria nova versão; recomendações antigas continuam explicáveis pela versão original. Uma transição não altera Meta Ads. Toda decisão sobre orçamento, público, formulário, criativo ou status de campanha exige aprovação explícita de Fagner, com policy check específico e histórico append-only.

## 12. Planejamento Git/Markdown

### Responsabilidades

- Repositório `black-beans-knowledge`: fonte humana aprovada em Git/Markdown, revisão e histórico editorial.
- PostgreSQL: referência imutável à versão, vigência, checksum, estado de validação e projeção operacional necessária para consultas.

### Pipeline proposto

1. Usuário autorizado informa/seleciona referência aprovada por mecanismo a definir.
2. Backend obtém ou recebe conteúdo por canal autorizado.
3. Parser seguro valida frontmatter/schema e tamanho; não executa HTML, scripts, includes ou comandos.
4. Checksum e referência Git são persistidos.
5. Versão anterior permanece ligada ao período em que esteve vigente.
6. KPI só participa de recomendação depois de validação bem-sucedida.

O mecanismo de acesso ao `black-beans-knowledge` — acesso direto controlado do runtime, entrega por CI ou outro canal autorizado — permanece aberto e não deve ser presumido.

## 13. Frontend

### Integração ao produto

- Rota e item de navegação dentro do shell atual, condicionados às capabilities recebidas.
- Contexto de workspace existente é obrigatório; não criar seletor de tenant paralelo.
- Camada de serviço central consome `/api/v1/paid-media` e adapta `snake_case` conforme padrão vigente.

### Módulos de tela

1. **Overview:** última coleta, saúde, indicadores resumidos, alterações novas e recomendações pendentes.
2. **Performance:** período, nível/filtros aprovados, totais/séries e metadados de fonte.
3. **Alterações:** timeline/lista paginada, contexto da Meta, revisão e nota.
4. **Recomendações:** fila, detalhe, evidências, histórico, decisão e tarefa ligada.
5. **Planejamento:** referência/version/checksum, vigência e estado de validação.
6. **Integração:** conexão, contas vinculadas e sync runs; visível apenas a permissões administrativas.
7. **Feedback:** registro interno do ritual semanal.

### Estados e segurança de UX

- Skeleton local, vazio, erro, parcial e stale são distintos.
- Toda visão de dados mostra “atualizado em”, período e timezone.
- Ação de decisão pede confirmação e justificativa quando a política exigir.
- Nenhum botão sugere que a recomendação será aplicada na Meta.
- Guardas frontend melhoram UX; backend continua sendo autoridade.
- Gráficos, se adotados, precisam de alternativa textual/tabela e acessibilidade AA.

## 14. Segurança e threat model resumido

| Ameaça | Controle |
|---|---|
| Exposição de credencial Composio ou metadado sensível | Secret management, redaction, metadados mínimos e nenhuma credencial Meta persistida localmente |
| Confusão de conexão/conta entre tenants | Identidade Composio vinculada ao workspace, validação de ownership e testes cross-workspace; fluxo gerenciado pelo Composio |
| IDOR/cross-tenant | Querysets tenant-aware, policy central, IDs internos e testes negativos |
| SSRF via referência ou URL | Origens/hosts permitidos e fetch server-side restrito; mecanismo Git ainda aberto |
| Prompt/HTML/script em Markdown | Parser de dados allowlist; não executar/renderizar conteúdo ativo |
| Log de payload sensível | Redaction, payload minimizado e testes de observabilidade |
| Job duplicado/concorrente | Idempotency key, constraints, transação e lock auxiliar |
| Recomendação tomada como execução | Linguagem explícita, workflow humano e allowlist exclusiva de tools read-only no Composio |
| Dados antigos usados como atuais | Freshness visível, estado stale e bloqueio de regras quando input inválido |

## 15. Deploy e operação no EasyPanel

- Reutilizar imagens e serviços atuais de web, API, worker, beat, Redis e PostgreSQL.
- Adicionar apenas a configuração necessária ao Composio e à política do módulo, usando secrets do ambiente; registrar nomes e instruções sem valores no Git.
- Migrations futuras serão parte do fluxo controlado de release; este documento não cria migrations.
- Beat agenda coleta diária de Insights e Activities; o primeiro sync de Insights cobre backfill de 90 dias. Timezone e horário permanecem abertos.
- Readiness da API não falha por indisponibilidade momentânea do Composio ou da Meta; painel de integração mostra degradação separadamente.
- Backup do PostgreSQL passa a cobrir tabelas do módulo; restore deve preservar relações e histórico.
- Rollout inicial restrito ao workspace/cliente piloto por RBAC/configuração explícita; mecanismo de feature flag é decisão aberta.
- Nenhuma nova dependência ou serviço é pressuposto nesta fase.

## 16. Estratégia de testes

- **Unitários:** normalização, precisão, timezone, dedupe, regras, parser de plano e transições.
- **Contrato do adapter Composio:** schemas de tools, paginação, campos ausentes, rate limit, estados de conexão e fixtures sanitizadas.
- **Integração/DB:** constraints tenant-aware, append-only, reprocessamento, concorrência e checkpoint.
- **API:** envelopes, filtros, paginação, erros e matriz RBAC com casos cross-workspace.
- **Jobs:** retry por classe, partial failure, retomada e execução repetida sem duplicata.
- **Frontend:** capabilities, estados stale/partial/error, acessibilidade e ausência de ações Meta.
- **E2E do slice:** conta/vínculo fixture -> sync Insights -> snapshot -> endpoint -> overview, sem chamada real em CI.
- **Produção piloto:** smoke via Composio read-only e prova explícita de que nenhuma tool/operação de escrita externa está disponível.

## 17. Sequência de implementação recomendada

1. Fase 0: contrato de dados, spike Composio-first para Meta e decisões abertas bloqueantes.
2. Primeiro slice vertical: vínculo configurado por fixture/admin controlado, sync diário de Insights, persistência, status e overview read-only.
3. Activities e revisão de alteração externa.
4. Planejamento Git/Markdown versionado.
5. Recomendações determinísticas e evidências.
6. Aprovação, tarefa, notificação e feedback semanal.
7. Hardening, observabilidade, segurança e rollout EasyPanel para Reforte.

## 18. Decisões fechadas e bloqueios remanescentes

Decisões fechadas:

- O piloto lê conta, campanha, conjunto de anúncios e anúncio.
- Há uma referência lógica a conexão Composio de Meta por workspace, e cada conta de anúncio é vinculada a um cliente existente do mesmo workspace.
- Decisões sobre orçamento, público, formulário, criativo ou status de campanha exigem aprovação explícita de Fagner.
- Insights recebe backfill inicial de 90 dias; Activities é coletada diariamente e persistida.
- Planejamento/KPI aprovado vem do repositório `black-beans-knowledge`.
- Meta é exclusivamente read-only no MVP.
- Composio é a única camada de integração Meta; o sistema não implementa OAuth Meta, não persiste/renova tokens Meta e não chama Graph/Marketing API diretamente.
- Uma referência lógica a conexão Composio de Meta por workspace pode vincular contas de anúncio a clientes existentes do mesmo workspace.
- CRM, Google Ads e tarefas usam Composio quando houver connector aplicável; integração direta exige decisão explícita posterior.

Bloqueios remanescentes:

- Padrão do backend para Composio (SDK/API/adapter), identidade/sessão, ID de conta conectada/conexão e isolamento por workspace.
- Toolkit/tools e schemas read-only para Insights, Activities e contas, incluindo paginação, rate limits, erros e limites da conta piloto.
- Semântica Composio de desconexão/revogação, reconexão e estados de saúde sanitizados.
- Configuração Composio por ambiente, documentada sem segredos no Git.
- Timezone, horário diário e lookback posterior ao backfill inicial de 90 dias.
- Chaves naturais quando Meta não fornecer identificador de activity estável.
- Demais estados do workflow, severidade e capability definitiva para a aprovação obrigatória de Fagner.
- Schema e mecanismo seguro de ingestão Git/Markdown a partir de `black-beans-knowledge`.
- Retenção e minimização de cada classe de dado.
- Eventos/notificações e limiar de falha/staleness.
- Feature flag/rollout e metas numéricas do piloto.

Nenhuma dessas escolhas deve ser preenchida por conveniência durante a implementação; deve virar decisão registrada na Fase 0.
