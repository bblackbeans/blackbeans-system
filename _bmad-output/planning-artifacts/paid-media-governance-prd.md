---
stepsCompleted:
  - discovery
  - product-definition
  - scope
  - requirements
  - risks-and-open-decisions
workflowType: prd
projectContext: brownfield
module: paid-media-governance
status: planning
date: 2026-08-27
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# PRD — Governança de Mídia Paga

## Resumo executivo

O módulo de Governança de Mídia Paga será uma capacidade interna do `blackbeans-system`, e não uma aplicação separada. Seu objetivo é dar à operação da Black Beans uma visão confiável, histórica e auditável sobre performance e alterações de mídia paga, começando pelo cliente piloto Reforte e por Meta Ads em modo exclusivamente leitura.

O módulo coletará diariamente Meta Insights e Meta Activities exclusivamente por meio do Composio, persistirá snapshots e eventos para não depender apenas do estado atual da plataforma externa, detectará alterações feitas fora do sistema e produzirá recomendações para decisão humana. No MVP, nenhuma campanha será criada, editada, pausada ou reativada automaticamente.

Bárbara, gestora de tráfego, será a usuária piloto principal. Fagner acompanhará o piloto e aprovará decisões relevantes. O cliente não terá login no MVP; seu feedback será obtido na reunião semanal e registrado internamente.

## Problema e oportunidade

Dados de performance, histórico de alterações, planejamento aprovado e decisões operacionais hoje podem ficar distribuídos entre plataformas e rituais. Isso dificulta:

- reconstruir o que mudou, quando e por quem;
- distinguir mudança externa de recomendação interna;
- comparar performance ao planejamento e aos KPIs aprovados;
- manter uma fila clara de recomendações, responsáveis e decisões;
- preservar contexto histórico quando a fonte externa muda ou deixa de expor dados antigos.

A oportunidade é conectar esses elementos à governança já existente no sistema: cliente, workspace, identidade, RBAC, auditoria, tarefas, notificações e jobs.

## Objetivo do produto

Permitir que a Black Beans monitore diariamente a operação de Meta Ads de um cliente, preserve evidências históricas, identifique alterações externas e transforme sinais de performance em recomendações rastreáveis para análise e aprovação humana.

### Princípios do MVP

1. **Leitura antes de automação:** a integração consulta a Meta, mas não escreve nela.
2. **Humano decide:** recomendação não é execução e nunca implica alteração automática.
3. **Histórico próprio:** snapshots e eventos relevantes permanecem no PostgreSQL.
4. **Tenant desde a origem:** todo dado operacional pertence a um workspace e, quando aplicável, a um cliente.
5. **Reuso da plataforma:** autenticação, autorização, auditoria, tarefas, notificações e jobs existentes são capacidades compartilhadas.
6. **Fonte e tempo explícitos:** métricas indicam fonte, período, timezone e momento da coleta.
7. **Planejamento versionado:** planejamento e KPI aprovados vêm do repositório `black-beans-knowledge`; o módulo apenas os importa ou referencia, preservando a versão Git.
8. **Composio-first:** Composio Platform é a única camada de integração com Meta Ads no MVP; o sistema não implementa OAuth Meta, não guarda ou renova tokens Meta e não chama Graph/Marketing API diretamente.

## Personas e stakeholders

### Bárbara — gestora de tráfego e usuária piloto

- Conecta a leitura operacional à rotina de gestão de campanhas.
- Consulta saúde da sincronização, performance, mudanças externas e recomendações.
- Registra contexto, analisa recomendações e encaminha decisões relevantes.
- Precisa confiar na atualidade e na origem dos dados.

### Fagner — acompanhamento e aprovação

- Acompanha os achados e a evolução do piloto.
- Aprova decisões relevantes conforme o processo operacional acordado.
- Precisa de síntese, evidências e trilha de decisão, sem operar diretamente a Meta pelo módulo.

### Operação interna autorizada

- Administra conexões, vínculos de contas de anúncio, permissões, falhas e reprocessamentos.
- Consulta auditoria e saúde dos jobs.
- Pode transformar recomendações em tarefas usando os recursos existentes.

### Cliente Reforte — stakeholder sem acesso ao sistema no MVP

- Participa do ritual semanal de feedback e alinhamento.
- Não recebe credencial nem interface própria.
- Feedback e decisões comunicadas pelo cliente são registrados por usuário interno.

## Escopo do MVP

### Incluído

- Módulo dentro da navegação e da autenticação do `blackbeans-system`.
- Uma única referência lógica a conexão Composio de Meta Ads, exclusivamente read-only, por workspace, configurada por usuário autorizado.
- Vínculo explícito entre workspace, cliente Reforte e contas de anúncio selecionadas.
- Descoberta e leitura controladas, no piloto, dos níveis conta, campanha, conjunto de anúncios e anúncio, sem assumir ingestão irrestrita de todas as contas acessíveis.
- Backfill inicial de 90 dias e coleta diária de Meta Insights, no conjunto de métricas aprovado.
- Coleta diária e persistência de Meta Activities no alcance suportado e validado para o piloto.
- Persistência de execuções de sincronização, snapshots de performance e eventos de atividade.
- Deduplicação e reprocessamento seguro dos jobs.
- Indicadores de atualidade, sucesso, atraso e erro da sincronização.
- Detecção de alterações externas com base nos eventos coletados.
- Recomendações internas explicáveis, com evidências e ciclo de decisão humano.
- Registro de feedback semanal e de decisões relevantes por usuários internos.
- Ligação ou criação de tarefa existente a partir de uma recomendação, sem duplicar o domínio de tarefas.
- Notificações internas existentes para eventos selecionados do módulo.
- Importação ou ligação de um documento Git/Markdown aprovado de planejamento/KPI vindo do repositório `black-beans-knowledge`, preservando referência de versão.
- Visões internas responsivas de resumo, performance, alterações, recomendações e saúde da integração.
- Trilha de auditoria para conexão, configuração, importação, recomendação, decisão e reprocessamento.
- Deploy no EasyPanel conforme os padrões Docker/infra atuais.

### Fora de escopo

- Qualquer escrita na Meta Ads, inclusive criar, editar, pausar, reativar ou excluir campanhas, conjuntos ou anúncios.
- Otimização autônoma, execução automática de recomendações ou aprovação automática.
- Login, portal, dashboard ou notificações diretas para o cliente.
- Substituição da reunião semanal com o cliente.
- Suporte produtivo a Google Ads, CRM ou MCP do sistema de tarefas.
- Data warehouse, lakehouse, BI externo ou armazenamento operacional fora do PostgreSQL.
- Editor colaborativo de planejamento/KPI; o Git/Markdown de `black-beans-knowledge` continua sendo a fonte aprovada.
- Atribuição própria, modelagem de incrementabilidade, previsão avançada ou geração de criativos.
- Cobertura multi-plataforma no primeiro release.
- OAuth Meta direto, armazenamento/renovação de tokens Meta ou chamadas diretas à Graph/Marketing API pelo `blackbeans-system`.
- Promessa de tempo real; a cadência prevista é diária.

## Jornadas principais

### 1. Leitura diária de performance

Bárbara abre o módulo no workspace autorizado, confirma a data da última sincronização e consulta a performance do período. A interface diferencia dado disponível, dado ainda não coletado e job com falha, além de mostrar período e timezone.

### 2. Alteração feita fora do sistema

O job diário coleta Meta Activities, identifica uma atividade ainda não registrada, persiste o evento e o apresenta como alteração externa. Bárbara consulta o contexto disponível na fonte e decide se o evento exige acompanhamento. O sistema não desfaz nem replica a alteração.

### 3. Recomendação e decisão humana

Uma regra aprovada encontra um sinal nos snapshots e cria uma recomendação com evidências, período analisado e versão da regra. Bárbara avalia e registra contexto. Quando a decisão for relevante, Fagner aprova ou rejeita segundo o fluxo definido; a decisão fica auditada. Se houver ação operacional, uma tarefa existente pode ser ligada ou criada.

### 4. Ritual semanal e feedback do cliente

Durante ou após a reunião semanal, um usuário interno registra o feedback da Reforte e o associa, quando aplicável, a uma recomendação, decisão ou período. O cliente não acessa o sistema.

### 5. Falha de integração

Um job falha ou o Composio informa conexão inválida, expirada ou revogada. A operação vê o estado sanitizado da conexão e a última coleta bem-sucedida, recebe notificação conforme política e pode iniciar a reconexão gerenciada pelo Composio ou reprocessar sem duplicar snapshots ou eventos.

## Requisitos funcionais

### Contexto, conexão e configuração

- **FR-PMG-01:** Usuário autorizado pode acessar o módulo apenas nos workspaces aos quais possui acesso.
- **FR-PMG-02:** Usuário autorizado pode iniciar/gerenciar pelo Composio, consultar o estado sanitizado e desconectar a única conexão Composio de Meta Ads do workspace, sempre limitada a leitura.
- **FR-PMG-03:** Usuário autorizado pode selecionar e vincular contas de anúncio permitidas a um workspace e a um cliente existente.
- **FR-PMG-04:** O sistema deve impedir que dados de uma conexão ou conta sejam consultados fora do workspace vinculado.
- **FR-PMG-05:** O sistema deve exibir a última sincronização bem-sucedida, a última tentativa e o estado atual por fonte/conta.
- **FR-PMG-06:** Alterações da referência de conexão Composio, vínculo/escopo de conta e configuração devem ser auditadas sem expor credenciais do Composio ou do provedor.

### Coleta e histórico

- **FR-PMG-07:** O sistema deve executar backfill inicial de 90 dias e coleta diária de Meta Insights para conta, campanha, conjunto de anúncios e anúncio ativos no piloto.
- **FR-PMG-08:** O sistema deve coletar diariamente e persistir Meta Activities para o alcance validado pelas tools/contratos disponibilizados pelo Composio.
- **FR-PMG-09:** Cada execução deve registrar status, janela solicitada, timestamps, contagens, erro sanitizado e identificador de correlação.
- **FR-PMG-10:** O sistema deve persistir snapshots de performance sem sobrescrever o histórico de coletas anteriores.
- **FR-PMG-11:** O sistema deve persistir eventos de atividade e deduplicá-los por identidade estável da fonte ou chave determinística documentada.
- **FR-PMG-12:** Reexecuções da mesma janela devem ser idempotentes e não multiplicar dados lógicos.
- **FR-PMG-13:** O sistema deve suportar retomada ou reprocessamento autorizado de falhas sem ampliar automaticamente o escopo coletado.
- **FR-PMG-14:** O sistema deve marcar origem, conta, entidade, período, timezone e momento de coleta em todo dado apresentado.

### Performance e alterações externas

- **FR-PMG-15:** Usuário autorizado pode consultar performance por período nos níveis conta, campanha, conjunto de anúncios e anúncio.
- **FR-PMG-16:** Usuário autorizado pode filtrar a visão usando dimensões aprovadas sem misturar contas ou workspaces.
- **FR-PMG-17:** O sistema deve apresentar alterações externas derivadas de Meta Activities, com o contexto fornecido pela fonte e sem inferir autoria não disponível.
- **FR-PMG-18:** Usuário autorizado pode marcar uma alteração como revisada e registrar nota interna.
- **FR-PMG-19:** A interface deve distinguir ausência de resultado, dado incompleto, dado desatualizado e erro de sincronização.

### Planejamento e KPI

- **FR-PMG-20:** Usuário autorizado pode importar ou vincular, a workspace, cliente e período de vigência, um documento Git/Markdown aprovado vindo do repositório `black-beans-knowledge`.
- **FR-PMG-21:** O sistema deve preservar referência de origem e versão do documento ligado/importado.
- **FR-PMG-22:** O sistema deve validar a estrutura importada contra um contrato definido na Fase 0 e rejeitar conteúdo inválido com erros acionáveis.
- **FR-PMG-23:** Alterar a referência ou versão do planejamento deve manter o histórico anterior e gerar auditoria.

### Recomendações, decisões e feedback

- **FR-PMG-24:** O sistema pode criar recomendações a partir de regras explícitas e versionadas aprovadas para o piloto.
- **FR-PMG-25:** Toda recomendação deve conter evidências, período analisado, regra/versão, estado e data de geração.
- **FR-PMG-26:** Usuário autorizado pode registrar análise, aceitar, rejeitar, arquivar ou encaminhar uma recomendação conforme RBAC.
- **FR-PMG-27:** Toda decisão que envolva orçamento, público, formulário, criativo ou status de campanha deve exigir aprovação explícita de Fagner antes de atingir estado final.
- **FR-PMG-28:** O sistema deve preservar histórico de estados, atores, justificativas e timestamps da recomendação.
- **FR-PMG-29:** Usuário autorizado pode associar uma recomendação a uma tarefa existente ou solicitar a criação de uma tarefa pelo domínio atual de tarefas.
- **FR-PMG-30:** Usuário interno pode registrar feedback da reunião semanal e associá-lo ao cliente, período e objetos do módulo.
- **FR-PMG-31:** O sistema deve deixar explícito que uma recomendação não foi executada na Meta pelo módulo.

### Notificação, auditoria e operação

- **FR-PMG-32:** O sistema deve usar a central de notificações existente para falha persistente de sincronização e eventos operacionais selecionados.
- **FR-PMG-33:** Usuário autorizado pode consultar execuções e falhas do adapter Composio dentro de seu escopo.
- **FR-PMG-34:** Superusuário ou perfil autorizado pode solicitar reprocessamento e consultar sua conclusão.
- **FR-PMG-35:** Eventos críticos do módulo devem usar a auditoria existente com `workspace_id` e `correlation_id`.
- **FR-PMG-36:** O módulo deve expor seus recursos pela API REST versionada existente e consumir essa API no frontend.

## Requisitos não funcionais

### Segurança e privacidade

- Aplicar autenticação, RBAC hierárquico e isolamento por workspace já existentes; ocultar navegação não substitui autorização no backend.
- Configurar/limitar no Composio somente operações de leitura e o menor acesso compatível com o piloto; nenhuma tool de mutação Meta pode ser disponibilizada ao módulo.
- Credenciais OAuth e todo o ciclo de tokens Meta pertencem ao Composio. O sistema persiste apenas identificadores e metadados sanitizados da conexão/conta e seu estado de saúde; segredos do Composio ficam no mecanismo de secrets do ambiente e nunca em Git, API, logs ou auditoria.
- Aplicar TLS em trânsito, segredos por ambiente e sanitização de erros/payloads.
- Registrar consentimento operacional/concessão e permitir que usuário autorizado solicite desconexão/revogação por meio do Composio, conforme contrato confirmado na Fase 0.
- Definir retenção, minimização e descarte antes da produção; valores permanecem decisão aberta.

### Confiabilidade e integridade

- Jobs devem ser idempotentes, observáveis, retentáveis e seguros contra execução concorrente da mesma conta/janela.
- Falha parcial não pode publicar execução como sucesso integral.
- Snapshots e eventos históricos não devem ser destruídos por uma nova sincronização.
- Respostas vazias, paginação incompleta, rate limit e estados de conexão inválida/expirada/revogada reportados pelo Composio devem produzir estados distintos e acionáveis.
- Datas devem ser armazenadas de forma consistente e apresentadas com timezone explícito.

### Performance e escalabilidade

- Manter como referência os objetivos globais do sistema (`p95 <= 300 ms` para leituras frequentes e `p95 <= 800 ms` para escritas/consultas complexas), excluindo a latência externa de Composio/Meta, que ocorre em jobs.
- Paginar listas de snapshots, eventos, recomendações e execuções.
- Indexar consultas pelo escopo tenant e pelos eixos temporais relevantes.
- Projetar um adapter Composio conforme o padrão definido na Fase 0. Futuras integrações de Google Ads, CRM e tarefas usam connector Composio quando aplicável; integração direta exige decisão explícita posterior.

### Usabilidade e acessibilidade

- Preservar padrões visuais e de navegação do frontend atual.
- Atender WCAG 2.1 AA nos fluxos principais, inclusive teclado, foco, contraste e rótulos.
- Não usar somente cor para representar tendência, falha, severidade ou estado.
- Exibir estados de carregamento, vazio, parcial, desatualizado e erro com próxima ação.

### Observabilidade e operação

- Propagar `correlation_id`, `workspace_id`, provedor, conta e execução em logs estruturados, excluindo segredos.
- Disponibilizar métricas mínimas de sucesso/falha, duração, atraso, volume e rate limiting.
- Integrar health/readiness aos padrões atuais sem tornar a disponibilidade da aplicação dependente da disponibilidade instantânea da Meta.
- Manter compatibilidade com os containers, worker/beat e deploy EasyPanel existentes.

## Critérios de sucesso do piloto

### Resultado para o usuário

- Bárbara consegue usar uma única visão interna para confirmar atualidade, consultar performance, revisar alterações externas e tratar recomendações da Reforte.
- Fagner consegue consultar evidências e registrar aprovação/rejeição das decisões relevantes.
- A reunião semanal gera registros internos rastreáveis, sem exigir login do cliente.

### Resultado operacional

- Após estabilização acordada, todas as contas Meta incluídas no piloto possuem coleta diária observável ou falha explicitamente sinalizada.
- Reprocessar uma mesma janela não cria duplicatas lógicas de snapshots ou atividades.
- Toda recomendação exibida possui evidência e versão de regra; toda decisão possui ator, horário e justificativa quando exigida.
- Nenhuma operação de escrita em campanha Meta é disponibilizada ou executada pelo módulo.
- Planejamento/KPI usado na análise possui referência identificável à versão aprovada em Git/Markdown.

### Métricas a instrumentar, com meta após baseline

- taxa de execuções diárias concluídas por conta;
- atraso entre fim do dia de referência e snapshot disponível;
- quantidade de duplicatas lógicas detectadas após reprocessamento;
- percentual de alterações externas revisadas no ritual operacional;
- tempo entre criação e decisão de recomendação;
- percentual de recomendações com decisão e justificativa completas;
- uso semanal do módulo por Bárbara e participação de Fagner nas aprovações relevantes;
- falhas de isolamento tenant ou exposição de segredo, cuja tolerância é zero.

Metas numéricas além de tolerância zero de segurança e duplicidade não foram confirmadas e devem ser definidas após a Fase 0 e a primeira semana de baseline.

## Riscos e mitigação

| Risco | Impacto | Mitigação planejada |
|---|---|---|
| Limites, permissões ou retenção da Meta não cobrirem o histórico esperado | Lacunas em Activities/Insights | Spike com conta piloto, matriz de campos e tratamento explícito de lacunas |
| Mudança de schemas/tools ou do contrato Composio/Meta | Quebra de coleta | Descoberta e registro na Fase 0, testes de contrato, telemetria e revisão planejada |
| Rate limit, paginação ou volume do Composio/provedor superior ao esperado | Atraso e falha parcial | Contrato validado, cursor/checkpoint quando suportado, backoff e limites por conta |
| Conexão Composio inválida, expirada ou revogada | Dados desatualizados | Estado de saúde sanitizado, alerta interno e reconexão gerenciada pelo Composio |
| Métricas sem contexto de atribuição/timezone | Decisão incorreta | Contrato de dados explícito e metadados visíveis |
| Regra gerar recomendação enganosa | Perda de confiança | Regras simples, versionadas, explicáveis e sempre sujeitas a humano |
| Duplicação ou sobrescrita em reprocessamento | Histórico não confiável | Chaves naturais/determinísticas, constraints e testes de idempotência |
| Vazamento entre clientes/workspaces | Incidente de segurança | Escopo obrigatório, policies centralizadas e testes negativos de autorização |
| Escopo crescer para CRM/Google Ads/MCP durante o piloto | Atraso no primeiro valor | Manter extensibilidade como fronteira, não como feature do MVP |
| Planejamento Markdown divergir do operacional | Comparação inválida | Referência de versão, vigência e validação do contrato importável |

## Dependências

- Acesso autorizado da Reforte à conta e aos ativos Meta definidos para o piloto.
- Projeto Composio Platform e connector Meta configurados para leitura, com segredo do Composio fornecido pelo mecanismo do ambiente e nunca versionado.
- Contrato aprovado de métricas, dimensões, níveis, timezone e janela de coleta.
- Definição do documento Git/Markdown de planejamento/KPI em `black-beans-knowledge` e de sua versão piloto.
- Capacidades existentes de workspace, cliente, autenticação, RBAC, auditoria, tarefas, notificações, Celery/beat, PostgreSQL e deploy.

## Decisões fechadas

1. O piloto lê os níveis conta, campanha, conjunto de anúncios e anúncio.
2. Existe uma referência lógica a conexão Composio de Meta por workspace; cada conta de anúncio é vinculada a um cliente já existente no mesmo workspace.
3. Decisões que envolvem orçamento, público, formulário, criativo ou status de campanha exigem aprovação explícita de Fagner.
4. Meta Insights recebe backfill inicial de 90 dias; Meta Activities é coletada diariamente e persistida.
5. O planejamento e os KPIs aprovados vêm do repositório `black-beans-knowledge`, com referência de versão preservada.
6. A integração Meta permanece exclusivamente read-only durante todo o MVP.
7. Composio é a única camada de integração Meta do MVP; OAuth, credenciais e ciclo de tokens Meta pertencem ao Composio, e o sistema não chama Graph/Marketing API diretamente.
8. Uma conexão Composio de Meta por workspace pode vincular contas de anúncio a clientes existentes do mesmo workspace.
9. Para CRM, Google Ads e tarefas, usa-se Composio quando houver connector aplicável; integração direta requer decisão explícita posterior.

## Decisões ainda abertas

Estas decisões não devem ser inferidas durante implementação:

1. Quais contas de anúncio específicas, métricas, dimensões, breakdowns e janelas de atribuição entram no piloto?
2. Qual timezone canônico será usado para corte diário e comparação com o planejamento?
3. Qual alcance e quais campos de Meta Activities estão efetivamente disponíveis para a conta/permissões da Reforte?
4. Qual formato/schema mínimo do Markdown de planejamento/KPI e qual mecanismo fornece a referência Git (commit, tag ou caminho versionado) dentro de `black-beans-knowledge`?
5. Quais regras de recomendação entram no MVP, quais severidades existem e quem pode alterá-las?
6. Quais são os demais estados do workflow e qual capability representa a aprovação explícita de Fagner?
7. Quais eventos geram notificação, para quais usuários e após quantas falhas/tolerância de atraso?
8. Quais políticas de retenção se aplicam a payload bruto, snapshots, activities, jobs, feedback e auditoria?
9. Qual nível de detalhe de valores anteriores/novos pode ser exibido sem inferir informação ausente da Meta?
10. Quais metas numéricas encerram o piloto e autorizam expansão para outros clientes/fontes?
11. Qual padrão de uso do Composio Platform será adotado no backend (SDK/API e eventual adapter), e como ele se encaixa na identidade e execução existentes?
12. Qual identificador de conexão/conta conectada do Composio será persistido, quais metadados sanitizados e estados de saúde compõem o contrato local e como ocorre isolamento por workspace?
13. Quais toolkit/tools e schemas read-only cobrem Insights, Activities e descoberta de contas, e quais são seus limites de paginação, rate limit e classes de erro?
14. Como desconexão/revogação e reconexão são solicitadas/observadas pelo sistema via Composio, sem implementar ciclo de token Meta?

## Evolução futura, não comprometida

- Google Ads como novo provedor de mídia, via Composio quando houver connector aplicável.
- Dados de CRM para relacionar mídia e resultados comerciais, via Composio quando houver connector aplicável.
- Integração de tarefas via Composio quando houver connector aplicável, além da integração interna já existente.
- Integração direta com qualquer provedor somente por decisão explícita posterior de produto, arquitetura e segurança.
- Novos clientes, aprovação externa e automações — somente após validação do piloto e nova decisão de produto/segurança.
