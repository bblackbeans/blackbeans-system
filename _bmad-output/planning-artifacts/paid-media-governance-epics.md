---
stepsCompleted:
  - requirements-traceability
  - dependency-ordering
  - epic-and-story-decomposition
  - acceptance-criteria
workflowType: epics-and-stories
projectContext: brownfield
module: paid-media-governance
status: planning
date: 2026-08-27
inputDocuments:
  - _bmad-output/planning-artifacts/paid-media-governance-prd.md
  - _bmad-output/planning-artifacts/paid-media-governance-architecture.md
---

# Épicos e stories — Governança de Mídia Paga

## Regras de planejamento

- A ordem abaixo é por dependência, não por preferência.
- Cada story deve entregar resultado testável e caber em uma unidade pequena de implementação/revisão.
- Fase 0 produz contratos e decisões, não código produtivo.
- Fase 1 é o primeiro slice vertical implementável e read-only.
- Nenhuma story autoriza escrita na Meta Ads.
- Composio Platform é a única camada de integração Meta do MVP: não há OAuth Meta direto, persistência/renovação de tokens Meta ou chamada direta à Graph/Marketing API.
- Decisões fechadas para todo o roadmap: leitura de conta/campanha/conjunto/anúncio; uma referência lógica a conexão Composio de Meta por workspace; conta vinculada a cliente existente; backfill de Insights de 90 dias; Activities diária e persistida; planejamento/KPI vindo de `black-beans-knowledge`; Meta exclusivamente read-only.
- CRM, Google Ads e tarefas devem usar Composio quando houver connector aplicável; integração direta depende de decisão explícita posterior.
- Toda decisão sobre orçamento, público, formulário, criativo ou status de campanha exige aprovação explícita de Fagner.
- Reuso de cliente, workspace, auth, RBAC, auditoria, tarefas, notificações e jobs é critério transversal.
- Itens marcados **[Decisão]** precisam ser resolvidos antes das stories que deles dependem.

## Mapa de fases

| Fase | Resultado | Dependência |
|---|---|---|
| 0 | Contrato Composio-first, dados e decisões bloqueantes validados com Reforte | Nenhuma |
| 1 | Primeiro slice: Insights diário até overview interno | Fase 0 |
| 2 | Activities e detecção/revisão de alterações externas | Fase 1 |
| 3 | Planejamento/KPI Git/Markdown versionado | Fase 0; pode iniciar após contrato |
| 4 | Recomendações explicáveis e deduplicadas | Fases 1 e 3 |
| 5 | Decisão/aprovação, tarefas, notificações e feedback | Fase 4; Activities quando relacionadas |
| 6 | Hardening e rollout do piloto no EasyPanel | Fases 1–5 aplicáveis ao MVP |

## Fase 0 — Descoberta e contrato de dados

### Épico 0.1 — Validar Composio e contrato Meta do piloto

**Objetivo:** remover incerteza sobre como o sistema usa o Composio e o que o connector Meta disponibiliza para a Reforte antes de modelar ou prometer comportamento.

#### Story 0.1.1 — Inventariar ativos e ownership do piloto

Como responsável pelo piloto, quero identificar workspace, cliente, conta(s) de anúncio e responsáveis para delimitar o tenant e o escopo da coleta.

**Critérios de aceite**

- Dado o cadastro atual, existe um registro de decisão que identifica sem ambiguidade o `Workspace` e o `Client` da Reforte.
- A lista de contas a incluir e excluir está registrada sem armazenar credencial Composio ou Meta no artefato.
- Bárbara, Fagner e o administrador da integração têm responsabilidades documentadas.
- Está registrado que existe uma referência lógica a conexão Composio de Meta por workspace e que cada conta selecionada é vinculada a um cliente existente do mesmo workspace.

#### Story 0.1.2 — Executar spike read-only da integração Composio

Como arquiteto, quero comprovar o uso do Composio Platform e limitar o connector Meta a leitura sem capacidade desnecessária.

**Critérios de aceite**

- O spike usa ambiente/conta autorizados, exclusivamente via Composio, e não altera qualquer campanha.
- **[Decisão]** Está registrado se o backend usa SDK, API ou adapter Composio, conforme o padrão do sistema, incluindo identidade/sessão e isolamento por workspace.
- **[Decisão]** O ID de conta conectada/conexão do Composio, os metadados sanitizados persistidos e o mapeamento uma conexão Meta por workspace estão documentados.
- **[Decisão]** Toolkit/tools reais e schemas necessários a contas, Insights e Activities são descobertos; somente operações read-only são allowlisted/configuradas.
- Rate limits, paginação, timeouts, classes de erro e estados de conexão inválida/expirada/revogada têm comportamento observado e registrado.
- Fluxos de conexão, reconexão e desconexão/revogação gerenciados pelo Composio estão documentados; o sistema não implementa OAuth, callback, scopes, refresh ou revoke Meta.
- Configuração do Composio por ambiente é registrada sem valores secretos no Git; nenhuma credencial ou payload sensível aparece em log compartilhado ou artefato.

#### Story 0.1.3 — Fechar contrato de Meta Insights

Como Bárbara, quero um contrato claro de performance para interpretar todos os números da mesma forma.

**Critérios de aceite**

- Os níveis do MVP são conta, campanha, conjunto de anúncios e anúncio; métricas, dimensões/breakdowns e filtros ainda são listados no contrato.
- O backfill inicial é de 90 dias; timezone, corte diário, moeda, granularidade e janela de atribuição estão registrados.
- Cada métrica tem tipo/unidade e regra para `null`, zero e indisponível.
- Existe uma amostra sanitizada e um resultado esperado de normalização.
- Paginação, precisão e possibilidade de revisão tardia de métricas foram verificadas.

#### Story 0.1.4 — Fechar contrato de Meta Activities

Como gestora de tráfego, quero saber quais mudanças podem ser observadas para não confundir limitação da fonte com ausência de alteração.

**Critérios de aceite**

- Categorias, campos, níveis e profundidade histórica disponíveis estão registrados a partir do piloto.
- Está documentado se existe ID estável; se não, a composição da chave determinística é decidida.
- Autoria, valor anterior/novo e timestamp são classificados como disponíveis, condicionais ou indisponíveis.
- Existe uma amostra sanitizada e resultado esperado de normalização.
- A UI/produto não promete reconstruir informação que a fonte não oferece.
- A coleta de Activities está definida como diária e persistente.

### Épico 0.2 — Fechar contratos internos e governança

#### Story 0.2.1 — Definir schema do planejamento/KPI em Markdown

Como operação, quero um formato validável para ligar o planejamento aprovado aos dados coletados.

**Critérios de aceite**

- **[Decisão]** Campos obrigatórios, opcionais, tipos, vigência, unidade e timezone estão documentados.
- Existe um exemplo válido e exemplos inválidos com mensagens esperadas.
- O repositório de origem é `black-beans-knowledge`; a referência de versão Git e o mecanismo de importação/ligação estão definidos.
- O contrato proíbe conteúdo executável e define limite/técnica de parsing seguro.
- Git/Markdown permanece fonte aprovada; o banco é projeção/referência operacional.

#### Story 0.2.2 — Definir regras iniciais de recomendação

Como Bárbara, quero começar com regras compreensíveis para conseguir validar os sinais do sistema.

**Critérios de aceite**

- Cada regra candidata informa objetivo, inputs, janela, condição, evidência e casos de não geração.
- **[Decisão]** O conjunto mínimo do piloto e suas severidades está aprovado por Bárbara e Fagner.
- Há exemplos de verdadeiro positivo, falso positivo e dado insuficiente.
- Está explícito que resultado é recomendação e não ação na Meta.
- Mudança de regra exige nova versão.

#### Story 0.2.3 — Definir workflow, relevância e matriz RBAC

Como responsável de governança, quero saber quem pode ver, analisar, aprovar e administrar o módulo.

**Critérios de aceite**

- **[Decisão]** Estados e transições de recomendação estão definidos.
- Decisões sobre orçamento, público, formulário, criativo ou status de campanha exigem aprovação explícita de Fagner; a capability e os demais estados do workflow estão definidos.
- Matriz inclui Bárbara, Fagner e administrador por capability e workspace.
- Casos proibidos, inclusive cross-workspace e autoaprovação quando aplicável, estão listados.
- As chaves finais reutilizam o mecanismo `PermissionAssignment`, sem papel paralelo.

#### Story 0.2.4 — Definir operação, retenção e sucesso do piloto

Como owner do piloto, quero critérios operacionais acordados para saber quando alertar, reter e avaliar o MVP.

**Critérios de aceite**

- **[Decisão]** Horário diário, lookback, política de retry e limiar de staleness estão registrados.
- **[Decisão]** Retenção/minimização de payload, snapshots, activities, jobs, feedback e auditoria está registrada.
- Eventos de notificação e destinatários estão definidos.
- Métricas de baseline, período de estabilização e metas numéricas do piloto estão aprovados ou explicitamente adiados com owner/data.
- Existe plano de resposta para conexão Composio inválida/expirada/revogada, rate limit e falha parcial.

## Fase 1 — Primeiro slice implementável: Insights até overview

### Épico 1.1 — Fundação tenant-aware read-only

#### Story 1.1.1 — Introduzir o domínio e vínculo de conta

Como administrador, quero registrar a referência lógica Composio de Meta e vincular uma conta de anúncio ao workspace e cliente corretos para que toda coleta tenha ownership explícito.

**Critérios de aceite**

- O app/domínio Django `paid_media` é criado e registrado, sem API, conector, job ou frontend.
- Models e migration mínimos representam uma referência lógica à conexão Composio de Meta por workspace e o vínculo de conta de anúncio a `Workspace` + `Client` existentes.
- Constraints garantem uma referência lógica de Meta por workspace, impedem duplicação da mesma conta no workspace e rejeitam cliente que não pertence ao workspace.
- Desativar conexão ou vínculo preserva o registro e o torna inelegível para futuras coletas, sem implementar coleta nesta story.
- Django admin básico é registrado conforme o padrão do backend, sem armazenar ou expor identificador Composio, credencial ou estado remoto nesta story.
- Testes RED/GREEN cobrem isolamento cross-workspace, duplicação e desativação.
- O detalhamento implementável está em `paid-media-governance-story-1.1.1.md`.
- Não há identificador/SDK/API Composio, credencial Meta, OAuth, callback, scope, refresh, revoke, frontend, sync, entidade Meta, Insights, Activities, chamada Graph/Marketing API nem qualquer escrita na Meta.

#### Story 1.1.2 — Estender RBAC e auditoria do módulo

Como admin, quero controlar acesso usando a governança existente.

**Critérios de aceite**

- Capabilities decididas na Fase 0 são aplicadas por `PermissionAssignment`/policies existentes.
- Conectar, vincular, desativar e reprocessar geram `AuditLog` com workspace e correlação.
- Credenciais Composio/Meta e segredos não aparecem em API, audit log ou logs.
- Testes cobrem allow, deny e acesso a outro workspace.

#### Story 1.1.3 — Integrar referência Composio e estado da conexão

Como administrador, quero conectar e diagnosticar a fonte pelo Composio sem o sistema custodiar credenciais Meta.

**Critérios de aceite**

- O backend usa SDK/API ou adapter Composio conforme a decisão da Fase 0 e vincula o identificador Composio ao workspace correto.
- A aplicação persiste somente identificadores/metadados sanitizados de conexão/conta e estado de saúde; não persiste nem renova tokens Meta.
- Conexão, reconexão e desconexão/revogação usam o fluxo gerenciado pelo Composio e preservam histórico/auditoria local.
- A API expõe somente estado e metadados sanitizados aprovados na Fase 0.
- Somente toolkit/tools read-only aprovados ficam disponíveis; não existe cliente Graph/Marketing API no sistema.

### Épico 1.2 — Coletar e persistir Insights diariamente

#### Story 1.2.1 — Implementar adapter Composio para Meta Insights

Como sistema, quero consultar e normalizar Insights para isolar detalhes da Meta do domínio.

**Critérios de aceite**

- Adapter usa SDK/API e schemas de tools Composio, campos, nível, timezone e atribuição definidos na Fase 0.
- Paginação, timeout, rate limit, estado de conexão e campo ausente têm testes de contrato.
- Decimal/moeda e `null` são preservados corretamente.
- Fixtures são sanitizadas e não incluem dados secretos.
- Não existe tool/operação de escrita em campanha no adapter do MVP nem chamada direta à Meta.

#### Story 1.2.2 — Persistir SyncRun e snapshots idempotentes

Como operação, quero reexecutar uma janela sem corromper o histórico.

**Critérios de aceite**

- Cada execução registra conta, dataset, janela, contrato, status, contagens, timestamps e correlação.
- Repetir a mesma janela não cria duplicata lógica.
- Revisão posterior da Meta é preservada como nova observação conforme regra aprovada.
- Falha parcial não aparece como sucesso integral.
- Constraints e testes de concorrência complementam o lock distribuído.

#### Story 1.2.3 — Agendar coleta diária e retomada segura

Como operação, quero coleta automática diária para não depender de ação manual.

**Critérios de aceite**

- Celery beat agenda apenas vínculos ativos no horário/timezone definidos.
- Worker persiste checkpoint após uma página confirmada transacionalmente.
- Retry respeita classificação do erro e `Retry-After`; erros permanentes não entram em loop.
- Execuções concorrentes da mesma chave não duplicam snapshots.
- Reprocessamento manual é autorizado, limitado ao escopo solicitado e auditado.

### Épico 1.3 — Entregar visibilidade do primeiro slice

#### Story 1.3.1 — Expor estado de sincronização e Insights na API

Como Bárbara, quero consultar performance e saber quão atual ela é.

**Critérios de aceite**

- Endpoints tenant-aware retornam sync runs e insights paginados sob `/api/v1/paid-media`.
- Resposta inclui período, timezone, moeda/unidade, fonte, coleta e completude.
- Ausência, stale, partial e erro são distinguíveis pelo contrato.
- Filtros não aceitos são rejeitados; IDs de outro workspace não retornam dados.
- OpenAPI e testes de contrato cobrem o slice.

#### Story 1.3.2 — Criar overview interno read-only

Como Bárbara, quero abrir o módulo e confirmar saúde e performance da Reforte.

**Critérios de aceite**

- O módulo aparece no shell atual somente para capability autorizada.
- Overview mostra conta/cliente, última coleta, período/timezone e métricas aprovadas.
- UI diferencia loading, vazio, stale, partial e erro com próxima ação.
- Nenhuma ação ou texto sugere aplicação automática na Meta.
- Fluxo principal é navegável por teclado e atende os checks de acessibilidade acordados.

#### Story 1.3.3 — Instrumentar e validar o slice em ambiente controlado

Como operador, quero observar a coleta ponta a ponta antes de adicionar novas capacidades.

**Critérios de aceite**

- Logs e métricas correlacionam workspace, vínculo e sync run sem segredo.
- Teste E2E com fixture cobre vínculo -> job -> snapshot -> API -> overview.
- Reexecução comprovada não gera duplicatas lógicas.
- Uma falha simulada aparece no estado de sync e não derruba readiness geral.
- Evidência confirma ausência de chamadas Meta de escrita.

## Fase 2 — Activities e alterações externas

### Épico 2.1 — Ingerir Activities

#### Story 2.1.1 — Implementar adapter Composio para Meta Activities

**Critérios de aceite**

- Usa exclusivamente a tool read-only e o schema Composio aprovados na Fase 0; não chama Meta diretamente.
- Usa somente campos/categorias comprovados na Story 0.1.4.
- Paginação, lacunas, autoria ausente, rate limit e erro de contrato têm testes.
- Não infere valor anterior, novo ou ator ausentes.
- Não expõe tool/operação de escrita.

#### Story 2.1.2 — Persistir eventos deduplicados

**Critérios de aceite**

- Evento guarda tenant, conta, entidade, tempo da fonte, tipo e metadados normalizados.
- ID estável ou digest decidido impede duplicata após reprocessamento/lookback.
- Eventos existentes não são sobrescritos por sincronização comum.
- Payload bruto segue minimização/retenção decididas.

#### Story 2.1.3 — Agendar e observar coleta de Activities

**Critérios de aceite**

- Activities possui run/checkpoint separado de Insights.
- Falha em Activities não invalida snapshot de Insights já concluído.
- Estado e atraso aparecem na saúde do módulo.
- Retry e reprocessamento obedecem às garantias da Fase 1.

### Épico 2.2 — Revisar mudanças externas

#### Story 2.2.1 — Expor timeline de alterações na API

**Critérios de aceite**

- Lista é paginada, tenant-aware e filtrável apenas pelos campos aprovados.
- Cada item informa fonte, ocorrência, entidade e disponibilidade de contexto.
- UI/API não chamam evento incompleto de “sem alteração”.

#### Story 2.2.2 — Criar tela de alterações

**Critérios de aceite**

- Bárbara visualiza alterações novas e revisadas em ordem clara.
- Dados desconhecidos aparecem como indisponíveis, não como valores inventados.
- Freshness e lacunas de coleta ficam visíveis.
- Tela atende teclado, foco e alternativa não baseada apenas em cor.

#### Story 2.2.3 — Registrar revisão e nota interna

**Critérios de aceite**

- Usuário com capability pode marcar revisão e incluir nota.
- Usuário somente leitura não pode mudar o estado.
- Ação registra ator, timestamp, workspace e auditoria.
- Repetir a mesma requisição não duplica o registro lógico.

## Fase 3 — Planejamento e KPI aprovados

### Épico 3.1 — Importar/ligar Markdown versionado

#### Story 3.1.1 — Implementar parser e validador seguro

**Critérios de aceite**

- Aceita o schema decidido e rejeita campo/tipo obrigatório inválido com erro acionável.
- Não executa HTML, script, include ou comando contido no documento.
- Calcula checksum determinístico e preserva unidade/timezone/vigência.
- Casos válidos e inválidos da Story 0.2.1 viram testes.

#### Story 3.1.2 — Persistir referência e versão do plano

**Critérios de aceite**

- Referência, versão Git, checksum, vigência, workspace e cliente ficam registrados.
- Nova versão não sobrescreve a anterior.
- Importação repetida da mesma versão/checksum é idempotente.
- Mudança de versão é auditada.

#### Story 3.1.3 — Expor estado do planejamento no módulo

**Critérios de aceite**

- Usuário autorizado vê versão, vigência, checksum e estado de validação.
- Conteúdo inválido não é usado como KPI ativo.
- Nenhum segredo/credencial do repositório é retornado.
- A interface deixa claro que a aprovação editorial ocorre no Git/Markdown.

## Fase 4 — Recomendações explicáveis

### Épico 4.1 — Versionar e executar regras

#### Story 4.1.1 — Persistir catálogo versionado de regras

**Critérios de aceite**

- Cada regra tem chave, versão, inputs, condição e explicação validados.
- Versão usada por recomendação não pode ser editada retroativamente.
- Ativação/desativação exige capability e auditoria.
- Somente regras aprovadas na Fase 0 ficam ativas no piloto.

#### Story 4.1.2 — Avaliar uma regra sobre dados completos

**Critérios de aceite**

- Job usa snapshots e plano na versão/período corretos.
- Dado stale, parcial, incompatível ou insuficiente não gera recomendação enganosa.
- Resultado guarda evidências e versão da regra.
- Testes cobrem verdadeiro positivo, não geração e dado insuficiente.

#### Story 4.1.3 — Deduplicar e atualizar a fila de recomendações

**Critérios de aceite**

- Mesma regra/versão/alvo/período não cria recomendação duplicada.
- Nova versão ou novo período mantém rastreabilidade separada.
- Reprocessamento de sync não multiplica a fila.
- Geração registra evento operacional e correlação sem fingir ator humano.

### Épico 4.2 — Consultar recomendações

#### Story 4.2.1 — Expor fila e detalhe na API

**Critérios de aceite**

- Fila é paginada, tenant-aware e filtrável por estados decididos.
- Detalhe inclui explicação, evidências, período, regra/versão e histórico.
- Referência inexistente ou de outro workspace não vaza existência.

#### Story 4.2.2 — Criar fila e detalhe no frontend

**Critérios de aceite**

- Bárbara consegue entender por que a recomendação foi gerada e quais dados a suportam.
- Dados insuficientes ou desatualizados ficam destacados textualmente.
- A interface afirma que nenhuma ação foi aplicada na Meta.
- Fluxo atende capability e acessibilidade acordadas.

## Fase 5 — Decisão humana e ritual operacional

### Épico 5.1 — Workflow e aprovação

#### Story 5.1.1 — Implementar transições autorizadas

**Critérios de aceite**

- Somente transições definidas na Story 0.2.3 são aceitas.
- Cada transição gera registro append-only com ator e timestamp.
- Justificativa é exigida nos estados definidos.
- Casos sem permissão e cross-workspace são negados e testados.

#### Story 5.1.2 — Exigir aprovação em decisão relevante

**Critérios de aceite**

- Recomendação sobre orçamento, público, formulário, criativo ou status de campanha não atinge estado final sem aprovação explícita de Fagner.
- Fagner, configurado com a capability no workspace piloto, pode aprovar/rejeitar; outro perfil não substitui essa aprovação.
- A decisão preserva evidência, justificativa e histórico anterior.
- Aprovar/rejeitar não faz chamada de escrita à Meta.

#### Story 5.1.3 — Expor controles e histórico de decisão

**Critérios de aceite**

- Frontend mostra apenas transições disponíveis ao usuário, sem substituir validação backend.
- Confirmação resume impacto interno e deixa explícita a ausência de execução externa.
- Histórico mostra ator, horário, estado e justificativa conforme autorização.

### Épico 5.2 — Integrar tarefas existentes

#### Story 5.2.1 — Ligar recomendação a tarefa existente

**Critérios de aceite**

- Somente tarefa do mesmo workspace e visível ao ator pode ser ligada.
- Ligação repetida não duplica relação.
- A recomendação exibe a tarefa ligada sem duplicar dados da tarefa.
- Ação gera auditoria.

#### Story 5.2.2 — Criar tarefa a partir de recomendação

**Critérios de aceite**

- Criação usa o serviço/API e regras do domínio atual de tarefas.
- Usuário escolhe os campos obrigatórios; o módulo não inventa responsável ou prazo.
- Falha na criação não muda indevidamente o estado da recomendação.
- Repetição com mesma chave de intenção não cria duas tarefas.

### Épico 5.3 — Notificação e feedback semanal

#### Story 5.3.1 — Notificar eventos aprovados

**Critérios de aceite**

- Usa a central/preferências de notificação existentes.
- Somente eventos, limiares e destinatários definidos na Story 0.2.4 são usados.
- Reexecução de job não duplica a mesma notificação lógica.
- Link da notificação respeita workspace e RBAC.

#### Story 5.3.2 — Registrar feedback da reunião da Reforte

**Critérios de aceite**

- Usuário interno autorizado registra data, resumo e vínculos opcionais.
- Registro identifica autor interno; não exige usuário do cliente.
- Consulta e edição respeitam workspace e são auditadas.
- Histórico relevante é preservado conforme política definida.

#### Story 5.3.3 — Consolidar visão do ritual semanal

**Critérios de aceite**

- Bárbara e Fagner veem alterações pendentes, recomendações, decisões e feedback do período conforme RBAC.
- Dados mostram atualização e eventuais lacunas.
- A visão não é disponibilizada ao cliente no MVP.

## Fase 6 — Hardening e rollout Reforte

### Épico 6.1 — Segurança e resiliência

#### Story 6.1.1 — Executar suíte de isolamento e RBAC

**Critérios de aceite**

- Toda rota do módulo possui caso sem login, sem capability e cross-workspace.
- Jobs validam vínculo ativo e tenant ao iniciar.
- Cache/locks não colidem entre workspaces/contas.
- Nenhum vazamento de existência ou dado é encontrado nos casos de teste.

#### Story 6.1.2 — Validar segredos e isolamento Composio

**Critérios de aceite**

- Credenciais Composio/Meta não aparecem em resposta, log, auditoria, fixture ou mensagem de erro; o sistema não persiste token Meta.
- Identificadores de conexão/conta conectada não podem ser usados fora do workspace associado.
- Conexão inválida, expirada ou revogada no Composio produz estado acionável e sanitizado.
- Toolkit/tools implantados correspondem à allowlist read-only aprovada; nenhuma operação de mutação é acessível.

#### Story 6.1.3 — Testar falha, concorrência e recuperação

**Critérios de aceite**

- Testes cobrem timeout, 429, 5xx, conexão Composio inválida, página malformada e indisponibilidade do broker.
- Reprocessamento após falha não duplica dado lógico.
- Falha parcial é visível e recuperável do checkpoint seguro.
- Readiness do sistema não depende do Composio ou da Meta estar online.

### Épico 6.2 — Operação e deploy

#### Story 6.2.1 — Completar dashboards, métricas e runbook

**Critérios de aceite**

- Métricas decididas na Fase 0 estão disponíveis por ambiente.
- Alertas cobrem conexão Composio inválida/expirada/revogada, atraso e falha persistente conforme limiares aprovados.
- Runbook descreve diagnóstico, reconexão, reprocessamento e escalonamento.
- Logs têm correlação suficiente e nenhum segredo.

#### Story 6.2.2 — Preparar configuração EasyPanel

**Critérios de aceite**

- Módulo reutiliza web, API, worker, beat, Redis e PostgreSQL existentes.
- Configuração/credencial do Composio fica em secrets do ambiente e está documentada sem valores no Git; não existem variáveis de credenciais Meta na aplicação.
- Backup/restore inclui as novas tabelas e relações.
- Plano de rollback preserva histórico e não exige escrita na Meta.

#### Story 6.2.3 — Liberar somente para o piloto Reforte

**Critérios de aceite**

- Acesso está restrito ao workspace e usuários aprovados.
- Bárbara conclui smoke test de overview, activities e recomendações aplicáveis.
- Fagner conclui smoke test de decisão relevante.
- É confirmada em produção a ausência de login do cliente e de ações Meta de escrita.
- Go/no-go e pendências são registrados.

#### Story 6.2.4 — Avaliar critérios de sucesso do piloto

**Critérios de aceite**

- Métricas do PRD são comparadas ao baseline e às metas aprovadas.
- Feedback semanal de Bárbara, Fagner e Reforte está consolidado internamente.
- Lacunas de fonte são separadas de defeitos do produto.
- Expansão para outro cliente ou automação exige decisão posterior. Google Ads, CRM e tarefas usam Composio quando houver connector aplicável; integração direta exige decisão explícita posterior.

## Gates entre fases

### Gate Fase 0 → Fase 1

- Contratos de Insights/timezone e integração Composio aprovados: SDK/API/adapter, ID de conta conectada/conexão, schemas/tools read-only, rate limits, erros, desconexão/revogação e isolamento; tenant/conta segue uma referência por workspace, conta ligada a cliente existente e backfill inicial de 90 dias.
- Nenhum segredo em artefatos.
- Matriz RBAC mínima definida para o slice.

### Gate Fase 1 → Fase 2/4

- Slice vertical funciona com fixture e ambiente controlado.
- Reexecução é idempotente.
- Freshness e falha são visíveis.
- Ausência comprovada de escrita Meta.

### Gate para recomendações

- Dados e plano têm versões/qualidade identificáveis.
- Regras aprovadas possuem exemplos e casos de dado insuficiente.
- Deduplicação e explicabilidade estão testadas.

### Gate de produção Reforte

- Isolamento/RBAC, integração Composio read-only, segredos, idempotência, recovery e acessibilidade crítica passaram.
- Runbook, alertas, backup e rollback estão prontos.
- Bárbara e Fagner validaram seus fluxos.
- Decisões abertas bloqueantes foram resolvidas ou removidas do release de forma explícita.

## Rastreabilidade resumida

| Capacidade do PRD | Fases/stories principais |
|---|---|
| Conexão, conta e tenant | 0.1.1–0.1.2, 1.1.1–1.1.3 |
| Insights e histórico | 0.1.3, 1.2.1–1.3.3 |
| Activities e alterações externas | 0.1.4, 2.1.1–2.2.3 |
| Planejamento Git/Markdown | 0.2.1, 3.1.1–3.1.3 |
| Recomendações explicáveis | 0.2.2, 4.1.1–4.2.2 |
| Aprovação humana | 0.2.3, 5.1.1–5.1.3 |
| Tarefas e notificações existentes | 5.2.1–5.3.1 |
| Feedback semanal sem login do cliente | 5.3.2–5.3.3 |
| Segurança, observabilidade e EasyPanel | 0.2.4, 6.1.1–6.2.4 |
