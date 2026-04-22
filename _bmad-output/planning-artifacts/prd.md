---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
releaseMode: single-release
inputDocuments:
  - /home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/product-brief-blackbeans-system.md
  - /home/kaue-ronald/Área de trabalho/blackbeans-system/Documento de Requisitos Funcionais (RFs) - Sistema de Gestão de Agência (tarefas_system).md
  - /home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/brainstorming/brainstorming-session-2026-04-14-08-39.md
workflowType: 'prd'
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 0
classification:
  projectType: saas_b2b
  domain: general
  complexity: medium-high
  projectContext: greenfield
---

# Product Requirements Document - blackbeans-system

**Author:** kaue-ronald
**Date:** 2026-04-14

## Executive Summary

O `blackbeans-system` e uma plataforma SaaS B2B de Work Management no modelo Monday.com, desenhada para o contexto operacional de agencias brasileiras. O produto centraliza a hierarquia completa de trabalho (`Workspace > Portfolio > Project > Board > Group > Task`) para eliminar fragmentacao entre ferramentas, reduzir perda de contexto e aumentar previsibilidade de entrega.

A V1 tem objetivo de cobertura funcional completa dos requisitos identificados, com foco no usuario primario **Coordenador de Operacoes** e suporte direto a gestores e colaboradores. O problema principal que o produto resolve e a falta de controle integrado entre cliente, execucao de tarefa, governanca de acesso e rastreabilidade operacional, que hoje gera atraso, retrabalho e baixa confianca nos indicadores de performance.

### What Makes This Special

O diferencial competitivo esta em combinar a experiencia de work management tipo Monday.com com profundidade vertical para agencia BR: controle de horas nativo no ciclo da tarefa (`start/pause/resume/concluir`), auditoria nativa de eventos criticos (CRUD, autenticacao, permissoes e tempo) e modelo de permissao granular aderente a hierarquia real da operacao.

A tese do produto e que ferramentas generalistas resolvem partes do fluxo, mas nao entregam governanca operacional completa sem customizacao pesada. O `blackbeans-system` busca resolver o ciclo inteiro com menor friccao de adocao, maior controle gerencial e base confiavel para decisao operacional.

## Project Classification

- **Project Type:** SaaS B2B (plataforma web de gestao para equipes)
- **Domain:** General software com especializacao em operacao de agencias
- **Complexity:** Medium-high (escopo funcional amplo + governanca/auditoria + assincrono)
- **Project Context:** Greenfield

## Success Criteria

### User Success

- Coordenadores de operacoes conseguem acompanhar backlog, execucao e risco em uma unica visao operacional sem alternar entre multiplas ferramentas.
- Equipes executam o ciclo de tarefa com controle de tempo nativo (iniciar, pausar, retomar, concluir) com rastreabilidade completa por tarefa.
- Usuarios de operacao identificam rapidamente gargalos por grupo/board e atuam antes de comprometer o prazo de entrega.

### Business Success

- O produto demonstra aderencia ao fluxo real de agencias BR, com uso recorrente dos modulos core de cliente, projeto, task e governanca.
- A operacao passa a ter indicadores confiaveis para gestao (prazo, retrabalho, tempo medio, adocao), reduzindo decisoes baseadas em percepcao.
- A proposta de valor diferencial (horas + auditoria + permissoes) e percebida como motivo concreto de adocao frente a ferramentas generalistas.

### Technical Success

- Cobertura funcional completa dos RFs mapeados para V1, com RNFs criticos implementados.
- Testes de API para modulos core ativos no pipeline como criterio de gate para release.
- Processamento assincrono operacional para notificacoes e eventos de prazo.
- Trilha de auditoria ativa para CRUD, autenticacao, permissoes e eventos de tempo.
- Endpoint `/health/` e monitoramento minimo de disponibilidade e falhas.

### Measurable Outcomes

- **Tarefas no prazo:** aumento consistente da taxa de conclusao dentro do prazo planejado.
- **Reducao de retrabalho:** queda no volume de reabertura/ajuste recorrente de tarefas.
- **Tempo medio por tarefa:** maior previsibilidade com reducao de variacao em tarefas comparaveis.
- **Adocao ativa semanal:** crescimento de usuarios ativos semanais por perfil operacional-chave.
- **Qualidade tecnica:** reducao de regressao em fluxo critico de API e estabilidade de release por sprint.

### Cadencia de Validacao Operacional

- O piloto deve operar com ritual semanal de acompanhamento entre coordenador de operacoes, lideranca e time de produto.
- Cada ciclo semanal deve registrar aprendizado, ajustes priorizados e impacto nas metricas-chave (prazo, retrabalho, tempo medio e adocao).
- O avanco do rollout depende da evidencia acumulada de melhoria operacional e estabilidade tecnica por ciclo.

## Product Scope

### MVP - Minimum Viable Product

- V1 com cobertura completa dos RFs documentados, incluindo:
  - clientes;
  - workspaces, portfolios e projetos;
  - boards, grupos e tarefas;
  - controle de tempo e logs de sessao;
  - colaboradores e departamentos;
  - permissoes granulares;
  - notificacoes assincronas;
  - logs e auditoria;
  - API REST e metricas;
  - RNFs criticos (assincrono, acesso administrativo, responsividade, transacoes atomicas e health check).

### Growth Features (Post-MVP)

- Aplicativo mobile nativo.
- Funcionalidades avancadas de IA para assistencia operacional, previsao e automacao contextual.

### Vision (Future)

- Evoluir para uma plataforma de referencia para operacao de agencias BR com inteligencia operacional embutida, governanca auditavel por padrao e camada de automacao orientada por dados de execucao.
- Expandir capacidades de decisao com recomendacoes proativas baseadas em comportamento de entrega, gargalos e risco de prazo.

## User Journeys

### Jornada 1 - Coordenador de Operacoes (caminho principal de sucesso)

**Opening Scene**  
A coordenadora Ana comeca a semana com multiplos clientes ativos e entregas simultaneas. Hoje ela alterna entre planilhas, chat e ferramentas separadas, sem confianca no status real de cada frente.

**Rising Action**  
No sistema, Ana entra no workspace da agencia, navega por portfolio e projeto, visualiza boards e grupos por etapa do fluxo, e identifica tarefas atrasadas, bloqueadas e sem responsavel. Ela cruza status com logs de tempo para entender se o risco e escopo, capacidade ou execucao.

**Climax**  
Ao detectar um projeto em risco, Ana redistribui responsaveis, ajusta prioridades e reordena grupos. Em minutos, consegue um plano de recuperacao orientado por dados reais (prazo, esforco e historico de execucao).

**Resolution**  
No fim da semana, ela tem previsibilidade melhor, menos retrabalho e maior clareza de cobranca com o time e com o cliente. A operacao deixa de ser reativa e vira gestao proativa.

### Jornada 2 - Coordenador de Operacoes (edge case: incidente de governanca e atraso critico)

**Opening Scene**  
Uma tarefa critica foi concluida fora do fluxo correto e um cliente questiona prazo e responsabilidade. Ha conflito entre status informado e execucao real.

**Rising Action**  
Ana acessa trilhas de auditoria, historico de mudancas de status, logs de tempo e alteracoes de permissao para reconstruir a linha do tempo do incidente.

**Climax**  
Ela identifica o ponto exato da quebra de processo (mudanca indevida de acesso + atualizacao fora da sequencia esperada), corrige a permissao, reabre o fluxo correto e define acao de contencao.

**Resolution**  
A equipe aprende com evidencia objetiva, o cliente recebe transparencia com dados, e o processo volta estavel com controles reforcados.

### Jornada 3 - Admin/Superusuario (setup, governanca e seguranca operacional)

**Opening Scene**  
O Admin Carlos recebe uma nova unidade operacional da agencia e precisa estruturar acesso sem comprometer seguranca.

**Rising Action**  
Carlos cria workspaces, associa colaboradores por area, aplica permissoes por nivel (workspace, portfolio, projeto, quadro) e usa operacao em lote para acelerar configuracao.

**Climax**  
Ao validar dashboards de permissoes e logs, ele encontra acessos excessivos em dois times e corrige antes de virar risco de operacao.

**Resolution**  
A agencia inicia operacao com controle de acesso coerente, rastreavel e auditavel, reduzindo risco de erro humano e exposicao indevida.

### Jornada 4 - Colaborador (execucao diaria e controle de tempo)

**Opening Scene**  
Juliana, designer, recebe tarefas de multiplos projetos e sente que perde tempo com mudancas de contexto e apontamentos manuais.

**Rising Action**  
Ela usa "Minhas Tarefas", inicia cronometro ao comecar, pausa em interrupcoes, retoma e conclui com comentarios de contexto. Tambem atualiza status e dependencias.

**Climax**  
Ao receber notificacao de prazo proximo, Juliana reprioriza com base no quadro e fecha a tarefa critica sem perder rastreabilidade do esforco.

**Resolution**  
Ela ganha foco no trabalho, reduz retrabalho de comunicacao e deixa historico confiavel para analise de produtividade e planejamento futuro.

### Jornada 5 - Gestor de Projetos/Contas (visibilidade e prestacao de contas)

**Opening Scene**  
O gestor Rafael precisa justificar andamento para cliente e lideranca sem dados consolidados.

**Rising Action**  
Ele consulta metricas de projeto, progresso por quadro, tarefas concluidas vs atrasadas e status geral do portfolio.

**Climax**  
Com indicadores claros, ele antecipa risco, negocia ajuste de prioridade e apresenta plano de entrega com base em evidencia.

**Resolution**  
A relacao com cliente melhora por previsibilidade e transparencia, reduzindo ruido e decisoes tardias.

### Journey Requirements Summary

Essas jornadas revelam capacidades obrigatorias:

- Hierarquia operacional completa (`Workspace > Portfolio > Project > Board > Group > Task`)
- Visoes de execucao (lista/kanban) com progresso e reordenacao
- Gestao de tarefas com responsavel, dependencias, status e comentarios
- Controle de tempo nativo com logs editaveis e rastreaveis
- "Minhas tarefas" com filtros operacionais
- Notificacoes assincronas por eventos criticos
- Permissoes granulares por nivel hierarquico + gestao em lote
- Auditoria detalhada para acoes criticas e autenticacao
- Metricas e estatisticas para coordenacao e prestacao de contas

## SaaS B2B Specific Requirements

### Project-Type Overview

O `blackbeans-system` e um SaaS B2B para operacao de agencias brasileiras, com foco em coordenacao de entrega, governanca de acesso e rastreabilidade operacional. O sistema deve suportar estrutura organizacional hierarquica e uso intensivo por times multiusuario com perfis diferentes.

### Technical Architecture Considerations

- Arquitetura multi-tenant logica por workspace/agencia, com isolamento de dados entre tenants.
- Modelo RBAC granular por escopo (`workspace`, `portfolio`, `project`, `board`) e por acao.
- API REST como camada principal de integracao interna entre modulos e consumo externo futuro.
- Processamento assincrono para notificacoes e rotinas de monitoramento de prazo.
- Auditoria transversal (aplicacao e seguranca) como capability obrigatoria da plataforma.

### Tenant Model

- Tenant primario associado ao contexto da agencia/workspace.
- Politica de isolamento: usuario so acessa entidades autorizadas no tenant e nos subniveis permitidos.
- Suporte a colaborador em multiplos workspaces com permissao explicita por escopo.

### RBAC Matrix (High-Level)

- **Admin/Superusuario:** configura workspaces, permissoes em lote, dashboards de auditoria.
- **Coordenador de Operacoes:** gestao operacional ponta a ponta de projetos/boards/tarefas dentro de escopo autorizado.
- **Gestor de Projetos/Contas:** acompanhamento de progresso, risco, status e metricas.
- **Colaborador:** execucao de tarefas, apontamento de tempo, atualizacao de status e comentarios.

### Integration Considerations

- Integracao inicial focada em notificacoes por email e eventos internos.
- API preparada para futuras integracoes com ferramentas externas de comunicacao e relatorios.
- Estrategia de versionamento de API prevista para evolucao de endpoints sem quebra de clientes.

### Implementation Considerations

- Aplicar testes de autorizacao por perfil/escopo como gate obrigatorio de release.
- Garantir trilha de auditoria para CRUD critico, autenticacao, mudancas de permissao e eventos de tempo.
- Definir limites operacionais (ex.: volume de notificacoes e consultas de dashboard) para manter performance.
- Padronizar contratos de erro da API para facilitar operacao e suporte.

## Project Scoping

### Strategy & Philosophy

**Approach:** single-release com cobertura completa dos requisitos funcionais definidos pelo usuario, mantendo priorizacao interna para reduzir risco de execucao sem remover escopo.

**Resource Requirements:** time enxuto e multidisciplinar com backend/API, frontend web, QA focado em testes de API, e suporte de produto para validacao de jornadas e metricas operacionais.

### Complete Feature Set

**Core User Journeys Supported:**
- Coordenador de Operacoes (caminho principal e edge case de governanca/atraso)
- Admin/Superusuario (setup e governanca)
- Colaborador (execucao com controle de tempo)
- Gestor de Projetos/Contas (visibilidade e prestacao de contas)

**Must-Have Capabilities:**
- Gestao de Clientes (`RF-CLI-01..06`)
- Gestao de Workspaces (`RF-WS-01..05`)
- Gestao de Portfolios (`RF-PORT-01..05`)
- Gestao de Projetos (`RF-PROJ-01..06`)
- Gestao de Boards/Groups (`RF-BRD-01..05`)
- Gestao de Tarefas e Tempo (`RF-TSK-01..10`)
- Gestao de Colaboradores/Departamentos (`RF-COL-01..04`)
- Permissoes granulares e em lote (`RF-PERM-01..06`)
- Notificacoes assincronas (`RF-NOT-01..05`)
- Logs e auditoria (`RF-LOG-01..04`)
- API REST e metricas (`RF-API-01..03`)
- RNFs criticos (`RNF-01..05`)

**Nice-to-Have Capabilities (ainda dentro da mesma release, apos estabilizacao do core):**
- dashboards avancados de produtividade por perfil
- templates operacionais pre-configurados por tipo de agencia/projeto
- refinamentos de UX para aceleracao de onboarding por papel

### Risk Mitigation Strategy

**Technical Risks:**
- Complexidade de permissao e auditoria em multiplos niveis hierarquicos  
  **Mitigacao:** matriz RBAC explicita + testes de autorizacao por escopo + trilha de auditoria validada por cenarios criticos.

**Market Risks:**
- Diferenciacao insuficiente frente a plataformas generalistas  
  **Mitigacao:** foco explicito em agencia BR, evidencia de valor nas metricas de prazo/retrabalho/tempo e prova de governanca operacional desde o inicio.

**Resource Risks:**
- Sobrecarga por escopo amplo em V1 unica  
  **Mitigacao:** sequencia de implementacao por dependencia, gates de qualidade por modulo, e controle rigoroso de “must-have vs nice-to-have” sem alterar requisitos core.

### Sequenciamento de Execucao por Dependencia

- **Etapa 1 - Fundacao tecnica:** identidade/acesso, observabilidade, health check, baseline de testes.
- **Etapa 2 - Dominio estruturante:** clientes, workspaces, portfolios e projetos.
- **Etapa 3 - Operacao diaria:** boards, grupos, tarefas, comentarios, anexos e controle de tempo.
- **Etapa 4 - Governanca e comunicacao:** permissoes granulares, auditoria e notificacoes assincronas.
- **Etapa 5 - Fechamento de release:** consolidacao de metricas, hardening de API e estabilizacao final.

## Functional Requirements

### Gestao de Identidade e Acesso

- FR1: Administrador pode autenticar no sistema com credenciais seguras.
- FR2: Sistema pode autorizar acesso por perfil de usuario e escopo organizacional.
- FR3: Administrador pode gerenciar usuarios e seus vinculos com colaboradores.
- FR4: Sistema pode restringir funcionalidades administrativas a perfis autorizados.
- FR5: Administrador pode aplicar permissoes granulares por `workspace`, `portfolio`, `project` e `board`.
- FR6: Administrador pode aplicar permissoes em lote para multiplos objetos.
- FR7: Administrador pode visualizar um painel centralizado de permissoes.
- FR8: Sistema pode registrar alteracoes de permissao para auditoria.

### Gestao de Colaboradores e Estrutura Organizacional

- FR9: Administrador pode cadastrar colaborador vinculado a usuario do sistema.
- FR10: Administrador pode associar colaborador a departamento/area.
- FR11: Administrador pode definir acesso de colaborador a workspaces especificos.
- FR12: Colaborador pode visualizar seu proprio perfil com dados profissionais.
- FR13: Gestor pode criar e gerenciar clientes com status ativo/inativo.
- FR14: Gestor pode listar e filtrar clientes por status e criterios de busca.
- FR15: Gestor pode visualizar detalhes e estatisticas consolidadas de cliente.
- FR16: Gestor pode criar, editar e excluir workspaces.
- FR17: Gestor pode criar, editar e excluir portfolios vinculados a workspaces.
- FR18: Gestor pode criar, editar e excluir projetos vinculados a cliente e/ou portfolio.
- FR19: Gestor pode atualizar status e cronograma real de projetos.
- FR20: Sistema pode calcular e exibir progresso e indicadores de risco de projeto.
- FR59: Gestor pode criar workspace com associacao opcional a cliente.

### Execucao Operacional (Boards, Grupos e Tarefas)

- FR21: Gestor pode criar board vinculado a projeto.
- FR22: Gestor pode criar, editar, excluir e reordenar grupos dentro do board.
- FR23: Sistema pode exibir board em visualizacao de lista e kanban.
- FR24: Sistema pode calcular progresso do board com base em tarefas concluidas.
- FR25: Usuario pode criar e editar tarefas com status, prioridade, cronograma e esforco.
- FR26: Usuario pode atribuir responsavel a tarefa.
- FR27: Usuario pode definir dependencias entre tarefas.
- FR28: Sistema pode recalcular datas de tarefas com base em dependencias.
- FR29: Usuario pode atualizar status da tarefa.
- FR30: Usuario pode visualizar e filtrar suas tarefas em "Minhas Tarefas".
- FR31: Usuario pode registrar comentarios em tarefas.
- FR32: Sistema pode manter historico de atividade da tarefa.
- FR33: Usuario pode anexar arquivos a tarefa.
- FR56: Usuario autorizado pode visualizar board em modo cronograma (timeline), alem de lista e kanban.
- FR57: Gestor pode definir e atualizar limite de trabalho em progresso (WIP limit) por grupo.

### Controle de Tempo e Produtividade

- FR34: Usuario pode iniciar cronometro de trabalho em tarefa.
- FR35: Usuario pode pausar cronometro com registro de sessao.
- FR36: Usuario pode retomar cronometro de tarefa pausada.
- FR37: Usuario pode concluir tarefa encerrando cronometro e registrando data de conclusao.
- FR38: Usuario pode editar ou excluir logs de sessao de tempo.
- FR39: Sistema pode consolidar tempo registrado por tarefa para analise operacional.

### Notificacoes e Comunicacao Operacional

- FR40: Sistema pode notificar colaborador ao ser designado como responsavel de tarefa.
- FR41: Sistema pode notificar conclusao de tarefa para usuarios relevantes.
- FR42: Sistema pode notificar tarefas atrasadas via processamento assincrono.
- FR43: Sistema pode notificar tarefas com prazo proximo via processamento assincrono.
- FR44: Usuario pode visualizar central de notificacoes e marcar itens como lidos.
- FR45: Sistema pode exibir contador de notificacoes nao lidas por usuario.

### Auditoria, Logs e API de Produto

- FR46: Sistema pode registrar eventos de criacao, atualizacao e exclusao de entidades criticas.
- FR47: Sistema pode registrar eventos de autenticacao (login, falha, logout).
- FR48: Sistema pode registrar eventos de controle de tempo em tarefas.
- FR49: Superusuario pode visualizar dashboard de logs com estatisticas.
- FR50: Superusuario pode listar e filtrar logs por criterios operacionais.
- FR51: Sistema pode expor endpoints CRUD para entidades principais.
- FR52: Sistema pode expor endpoints de acoes especificas (tempo, status, dependencias).
- FR53: Sistema pode expor endpoints de estatisticas para projetos, portfolios e workspaces.
- FR54: Sistema pode disponibilizar endpoint de health check para monitoramento.
- FR55: Sistema mantem hierarquia operacional explicita `Workspace > Portfolio > Project > Board > Group > Task`.
- FR58: Gestor pode alternar rapidamente status de cliente (ativo/inativo), incluindo endpoint dedicado de API.

## Non-Functional Requirements

### Performance

- O sistema deve atender `p95 <= 300ms` para endpoints de leitura de uso frequente.
- O sistema deve atender `p95 <= 800ms` para operacoes de escrita e consultas mais complexas.
- Operacoes criticas de interacao do usuario nao devem causar bloqueio perceptivel no fluxo operacional.

### Security

- O sistema deve usar criptografia em transito (TLS) para toda comunicacao cliente-servidor e servico-servico.
- O sistema deve usar criptografia em repouso para dados sensiveis e credenciais.
- O sistema deve aplicar RBAC por escopo hierarquico (`workspace`, `portfolio`, `project`, `board`).
- O sistema deve manter trilha de auditoria imutavel para eventos criticos (CRUD relevante, permissoes, autenticacao e tempo).
- O sistema deve suportar autenticacao de dois fatores (2FA), obrigatoria para perfis administrativos.

### Scalability

- O sistema deve suportar crescimento inicial para pelo menos `50 agencias` e `2.000 usuarios ativos` sem degradacao funcional critica.
- A arquitetura deve permitir expansao progressiva de capacidade sem reescrita do nucleo de dominio.
- O sistema deve tolerar aumento de carga com monitoramento e ajustes operacionais previsiveis.

### Accessibility

- A interface web deve atender diretrizes WCAG 2.1 nivel AA nos fluxos principais da operacao.
- Componentes criticos de navegacao e acao devem ser utilizaveis por teclado e compativeis com leitores de tela.
- Conteudo e feedback visual devem manter contraste e legibilidade adequados para uso continuo.

### Integration

- A V1 deve suportar integracao de notificacoes internas e envio por email como mecanismos oficiais de alerta.
- O sistema deve padronizar contratos de API para facilitar integracoes futuras sem quebra de compatibilidade.
- Integracoes externas adicionais ficam fora de escopo da V1, com arquitetura preparada para evolucao posterior.
