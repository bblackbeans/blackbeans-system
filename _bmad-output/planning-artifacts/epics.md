---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/prd.md"
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/architecture.md"
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/ux-design-specification.md"
---

# blackbeans-system - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for blackbeans-system, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

- **FR1-FR8 (IAM e Permissoes):** autenticacao segura, autorizacao por perfil/escopo, gestao de usuarios, painel e aplicacao de permissoes granulares e em lote, auditoria de alteracoes.
- **FR9-FR12 (Colaboradores):** cadastro de colaborador, associacao a departamentos, vinculo de acesso a workspaces, visualizacao de perfil.
- **FR13-FR20 e FR59 (Clientes, Workspaces, Portfolios e Projetos):** CRUD completo, associacoes hierarquicas, atualizacao de cronograma/status, progresso e risco, workspace com associacao opcional a cliente.
- **FR21-FR33, FR56, FR57 (Boards, Groups e Tarefas):** CRUD/reordenacao de grupos, lista/kanban/timeline, progresso de board, tarefas com status/prioridade/esforco/dependencias, comentarios, anexos, historico, WIP limit.
- **FR34-FR39 (Tempo e Produtividade):** iniciar/pausar/retomar/concluir cronometro, editar/excluir logs, consolidacao de tempo por tarefa.
- **FR40-FR45 (Notificacoes):** notificacoes por designacao, conclusao, atraso e prazo proximo (assincrono), central de notificacoes, leitura e contador de nao lidas.
- **FR46-FR50 (Auditoria e Logs):** trilha de eventos CRUD criticos, autenticacao e tempo; dashboard/listagem filtravel para superusuario.
- **FR51-FR55 e FR58 (API e Plataforma):** endpoints CRUD e endpoints de acoes especificas, estatisticas, health check, hierarquia operacional explicita e endpoint dedicado de alternancia de status de cliente.

### NonFunctional Requirements

- **Performance:** p95 <= 300ms para leituras frequentes e p95 <= 800ms para escritas/consultas complexas.
- **Seguranca:** TLS, criptografia em repouso, RBAC por escopo hierarquico, auditoria imutavel, 2FA obrigatoria para perfis administrativos.
- **Escalabilidade:** suportar ao menos 50 agencias e 2.000 usuarios ativos com evolucao de capacidade sem reescrita do nucleo.
- **Acessibilidade:** WCAG 2.1 AA nos fluxos principais, navegacao por teclado e compatibilidade com leitor de tela.
- **Integracao:** notificacoes internas + email na V1, contratos de API padronizados e preparados para evolucoes.

### Additional Requirements

- **Arquitetura base obrigatoria:** backend Django + DRF, frontend Next.js + TypeScript + Ant Design, PostgreSQL, Celery + Redis, deploy Docker + VPS com containers separados (`frontend`, `backend`, `worker`, `redis`, `postgres`, `proxy`).
- **Multi-tenancy:** single database/shared schema com `workspace_id` obrigatorio em entidades e filtros de consulta.
- **Contrato de API:** REST versionada em `/api/v1`, OpenAPI versionado, envelope padrao de sucesso/erro e `correlation_id`.
- **Resiliencia assincrona:** idempotencia de jobs, retry/backoff, trilha de falhas e reprocessamento.
- **Padroes de implementacao:** `snake_case` no backend/API, endpoints no plural, `PascalCase` para componentes React, `camelCase` para funcoes/variaveis frontend, arquivos frontend em `kebab-case`.
- **Observabilidade e operacao:** logs estruturados com `workspace_id`, `actor_id`, `correlation_id`; health/readiness checks; cache Redis para visoes operacionais densas.
- **Qualidade e governanca tecnica:** testes de autorizacao por escopo, testes de contrato para API, gates CI para fluxos criticos.

### UX Design Requirements

- **Experiencia central:** `TaskDrawerPanel` como fluxo principal de atualizacao rapida de tarefa (status + tempo + comentario) sem troca de contexto.
- **Assistente explicito:** `AssistantRecommendationBox` sempre visivel no drawer com impacto e proxima acao.
- **Estrategia de erro/bloqueio:** modelo hibrido (resolver no drawer quando simples, escalar para tela dedicada em conflitos complexos).
- **Design system:** fundacao Ant Design com tokens da marca (`#DA9330`, `#141312`, `#B1B0B1`, `#F4F0ED`), grade base 8px e UI enterprise densa.
- **Componentes V1 prioritarios:** `TaskDrawerPanel`, `OperationalStatusBadge`, `CapacityChip`, `NotificationActionItem`, `AuditTimelinePanel`.
- **Jornadas obrigatorias de UX:** coordenador (risco+capacidade), colaborador (execucao diaria), admin (governanca/permissoes) com consistencia de termos e feedbacks.
- **Responsividade:** desktop-first com breakpoints 320-767, 768-1023, 1024+.
- **Acessibilidade:** objetivo WCAG 2.1 AA com foco visivel, navegacao por teclado, semantica e contraste.

### FR Coverage Map

FR1: Epic 1 - Acesso seguro e governanca base
FR2: Epic 1 - Acesso seguro e governanca base
FR3: Epic 1 - Acesso seguro e governanca base
FR4: Epic 1 - Acesso seguro e governanca base
FR5: Epic 1 - Acesso seguro e governanca base
FR6: Epic 1 - Acesso seguro e governanca base
FR7: Epic 1 - Acesso seguro e governanca base
FR8: Epic 1 - Acesso seguro e governanca base
FR9: Epic 1 - Acesso seguro e governanca base
FR10: Epic 1 - Acesso seguro e governanca base
FR11: Epic 1 - Acesso seguro e governanca base
FR12: Epic 1 - Acesso seguro e governanca base

FR13: Epic 2 - Estrutura operacional de clientes e projetos
FR14: Epic 2 - Estrutura operacional de clientes e projetos
FR15: Epic 2 - Estrutura operacional de clientes e projetos
FR16: Epic 2 - Estrutura operacional de clientes e projetos
FR17: Epic 2 - Estrutura operacional de clientes e projetos
FR18: Epic 2 - Estrutura operacional de clientes e projetos
FR19: Epic 2 - Estrutura operacional de clientes e projetos
FR20: Epic 2 - Estrutura operacional de clientes e projetos
FR58: Epic 2 - Estrutura operacional de clientes e projetos
FR59: Epic 2 - Estrutura operacional de clientes e projetos

FR21: Epic 3 - Execucao de trabalho em boards e tarefas
FR22: Epic 3 - Execucao de trabalho em boards e tarefas
FR23: Epic 3 - Execucao de trabalho em boards e tarefas
FR24: Epic 3 - Execucao de trabalho em boards e tarefas
FR25: Epic 3 - Execucao de trabalho em boards e tarefas
FR26: Epic 3 - Execucao de trabalho em boards e tarefas
FR27: Epic 3 - Execucao de trabalho em boards e tarefas
FR28: Epic 3 - Execucao de trabalho em boards e tarefas
FR29: Epic 3 - Execucao de trabalho em boards e tarefas
FR30: Epic 3 - Execucao de trabalho em boards e tarefas
FR31: Epic 3 - Execucao de trabalho em boards e tarefas
FR32: Epic 3 - Execucao de trabalho em boards e tarefas
FR33: Epic 3 - Execucao de trabalho em boards e tarefas
FR55: Epic 3 - Execucao de trabalho em boards e tarefas
FR56: Epic 3 - Execucao de trabalho em boards e tarefas
FR57: Epic 3 - Execucao de trabalho em boards e tarefas

FR34: Epic 4 - Controle de tempo e produtividade
FR35: Epic 4 - Controle de tempo e produtividade
FR36: Epic 4 - Controle de tempo e produtividade
FR37: Epic 4 - Controle de tempo e produtividade
FR38: Epic 4 - Controle de tempo e produtividade
FR39: Epic 4 - Controle de tempo e produtividade

FR40: Epic 5 - Alertas e comunicacao operacional assíncrona
FR41: Epic 5 - Alertas e comunicacao operacional assíncrona
FR42: Epic 5 - Alertas e comunicacao operacional assíncrona
FR43: Epic 5 - Alertas e comunicacao operacional assíncrona
FR44: Epic 5 - Alertas e comunicacao operacional assíncrona
FR45: Epic 5 - Alertas e comunicacao operacional assíncrona

FR46: Epic 6 - Auditoria, API e observabilidade de plataforma
FR47: Epic 6 - Auditoria, API e observabilidade de plataforma
FR48: Epic 6 - Auditoria, API e observabilidade de plataforma
FR49: Epic 6 - Auditoria, API e observabilidade de plataforma
FR50: Epic 6 - Auditoria, API e observabilidade de plataforma
FR51: Epic 6 - Auditoria, API e observabilidade de plataforma
FR52: Epic 6 - Auditoria, API e observabilidade de plataforma
FR53: Epic 6 - Auditoria, API e observabilidade de plataforma
FR54: Epic 6 - Auditoria, API e observabilidade de plataforma

## Epic List

### Epic 1: Acesso Seguro e Governança Base
Admin e coordenadores conseguem entrar no sistema com segurança, gerenciar usuários/colaboradores e aplicar permissões por escopo com rastreabilidade.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12

### Epic 2: Estrutura Operacional de Clientes e Projetos
Gestores conseguem estruturar a operação ponta a ponta (cliente, workspace, portfolio e projeto), com status, cronograma e risco visíveis; incluindo alternância rápida do status do cliente e criação de workspace com associação opcional.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR58, FR59

### Epic 3: Execução de Trabalho em Boards e Tarefas
Times conseguem planejar e executar tarefas em lista/kanban/timeline, com dependências, histórico e consistência operacional.
**FRs covered:** FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR55, FR56, FR57

### Epic 4: Controle de Tempo e Produtividade Operacional
Colaboradores registram tempo na tarefa (iniciar/pausar/retomar/concluir), editam/excluem logs e consolidam o tempo para análise operacional.
**FRs covered:** FR34, FR35, FR36, FR37, FR38, FR39

### Epic 5: Alertas e Comunicação Operacional Assíncrona
Usuários recebem alertas acionáveis (designação, conclusão, atraso e prazo próximo) e gerenciam leitura/contadores em central de notificações.
**FRs covered:** FR40, FR41, FR42, FR43, FR44, FR45

### Epic 6: Auditoria, API e Observabilidade de Plataforma
Superusuários auditarão eventos críticos e operarão a plataforma via APIs e health check, com endpoints e métricas essenciais para suporte e estabilidade.
**FRs covered:** FR46, FR47, FR48, FR49, FR50, FR51, FR52, FR53, FR54

## Epic 1: Acesso Seguro e Governança Base

Admin e coordenadores conseguem entrar no sistema com segurança, gerenciar usuários/colaboradores e aplicar permissões por escopo com rastreabilidade.

### Story 1.1: Setup inicial do projeto a partir de starter template

As a Time de desenvolvimento,
I want inicializar backend e frontend a partir dos starters arquiteturais aprovados, com stack Docker base funcional,
So that as historias funcionais do produto sejam implementadas sobre uma fundacao padronizada e reproduzivel.

**Acceptance Criteria:**

**Given** o repositório de trabalho do projeto
**When** o time inicializar o backend com `cookiecutter-django` e o frontend com `create-next-app` conforme decisao de arquitetura
**Then** ambos os projetos base devem ser gerados com estrutura minima esperada e versionados no repositório
**And** dependencias iniciais devem instalar com sucesso em ambiente de desenvolvimento

**Given** a stack definida em arquitetura (api, web, worker, redis, postgres e proxy)
**When** o time subir os servicos com docker compose do ambiente de desenvolvimento
**Then** os containers devem iniciar sem erro bloqueante
**And** API e web devem ficar acessiveis internamente para execucao das historias seguintes

**Given** a necessidade de consistencia para multiplos agentes de desenvolvimento
**When** o setup inicial for concluido
**Then** arquivos de configuracao de ambiente e instrucoes de bootstrap minimo devem estar presentes
**And** a base deve permitir evolucao incremental sem exigir criacao massiva de entidades antecipadas

### Story 1.2: Login do Administrador com JWT (access + refresh)

As a Admin/Superusuario,
I want autenticar com credenciais seguras e receber `access_token` (curto) e `refresh_token` (rotativo),
So that eu consiga acessar recursos protegidos com autenticacao e base para autorizacao por escopo.

**Acceptance Criteria:**

**Given** um usuario Admin/Superusuario cadastrado e ativo (com credenciais validas)
**When** eu fizer `POST /api/v1/auth/tokens` enviando credenciais validas
**Then** a API deve retornar `200` com envelope de sucesso contendo `data.access_token`, `data.refresh_token`, `data.token_type` e identificador do ator
**And** o `access_token` deve conter expiracao (`exp`) e identificacao do ator autenticado

**Given** credenciais invalidas (senha incorreta ou usuario inexistente)
**When** eu fizer `POST /api/v1/auth/tokens`
**Then** a API deve retornar `401` com envelope de erro padronizado contendo `error.code`, `error.message` e `correlation_id`
**And** nenhum token deve ser retornado

**Given** um `refresh_token` valido e nao expirado
**When** eu fizer `POST /api/v1/auth/tokens/refresh` enviando o `refresh_token`
**Then** a API deve retornar `200` com novo `access_token`
**And** deve retornar um novo `refresh_token` (rotacao)

**Given** um `refresh_token` rotacionado anteriormente (ja invalidado)
**When** eu tentar reutiliza-lo em `POST /api/v1/auth/tokens/refresh`
**Then** a API deve retornar `401` com `error.code` apropriado para token invalido e `correlation_id`
**And** nenhum token deve ser retornado

**Given** um `refresh_token` expirado
**When** eu fizer `POST /api/v1/auth/tokens/refresh`
**Then** a API deve retornar `401` com `error.code` apropriado para token expirado e `correlation_id`
**And** a resposta deve seguir o envelope de erro padronizado da plataforma

### Story 1.3: Verificacao de 2FA obrigatoria para admins

As a Admin/Superusuario,
I want validar um segundo fator apos a autenticacao inicial,
So that o acesso administrativo fique protegido contra comprometimento de credenciais.

**Acceptance Criteria:**

**Given** um admin com credenciais validas e regra de 2FA obrigatoria para perfil administrativo
**When** ele fizer `POST /api/v1/auth/tokens` e concluir a primeira etapa de autenticacao
**Then** a API deve retornar autenticacao pendente de 2FA sem emitir tokens finais
**And** deve retornar `challenge_id` (ou equivalente) para verificacao do segundo fator

**Given** um `challenge_id` valido e um codigo 2FA correto
**When** o admin fizer `POST /api/v1/auth/tokens/2fa/verify` com `challenge_id` e codigo
**Then** a API deve retornar `200` com `access_token` e `refresh_token`
**And** deve registrar evento de auditoria de login administrativo com 2FA bem-sucedido

**Given** um codigo 2FA invalido
**When** o admin fizer `POST /api/v1/auth/tokens/2fa/verify`
**Then** a API deve retornar `401` com envelope de erro padronizado e `correlation_id`
**And** nao deve emitir tokens

**Given** multiplas tentativas invalidas de 2FA acima do limite configurado
**When** uma nova tentativa for feita dentro da janela de bloqueio
**Then** a API deve retornar erro de bloqueio temporario conforme contrato (`429` ou `423`)
**And** deve registrar evento de seguranca para auditoria

**Given** um `challenge_id` expirado ou ja consumido
**When** o admin tentar verificar novamente em `POST /api/v1/auth/tokens/2fa/verify`
**Then** a API deve retornar erro de challenge invalido/expirado com `correlation_id`
**And** deve exigir novo fluxo de login

### Story 1.4: Gestao de usuarios e vinculo com colaborador

As a Admin/Superusuario,
I want criar/atualizar/desativar usuarios e vincula-los a colaboradores,
So that eu mantenha controle de acesso e identidade operacional coerente com a estrutura da agencia.

**Acceptance Criteria:**

**Given** um admin autenticado e autorizado
**When** ele fizer `POST /api/v1/users` com dados validos de um novo usuario
**Then** a API deve retornar `201` com o usuario criado em envelope de sucesso
**And** o usuario deve iniciar em estado ativo por padrao (ou conforme regra enviada)

**Given** um usuario existente
**When** o admin fizer `PATCH /api/v1/users/{user_id}` para atualizar dados permitidos
**Then** a API deve retornar `200` com os dados atualizados
**And** alteracoes invalidas devem retornar erro padronizado com `correlation_id`

**Given** um usuario existente com atividades historicas
**When** o admin fizer `PATCH /api/v1/users/{user_id}` alterando `is_active` para `false`
**Then** o usuario deve ficar impedido de autenticar novos acessos
**And** os registros historicos/auditoria devem permanecer preservados

**Given** um colaborador existente sem vinculo de usuario
**When** o admin fizer `POST /api/v1/users/{user_id}/collaborator-links` informando `collaborator_id`
**Then** a API deve retornar `201` com vinculo ativo criado
**And** deve impedir duplicidade de vinculo invalido conforme regra de negocio

**Given** um vinculo usuario-colaborador existente
**When** o admin fizer remocao/desassociacao via endpoint de vinculo
**Then** a API deve retornar sucesso e refletir o vinculo removido
**And** deve registrar evento de auditoria de criacao/edicao/desativacao/desvinculacao

### Story 1.5: Gestao de colaborador (departamento) e perfil proprio

As a Admin/Superusuario,
I want cadastrar e manter dados de colaborador com associacao a departamento, e permitir que o colaborador visualize seu proprio perfil,
So that a estrutura organizacional fique consistente e cada pessoa tenha clareza dos seus dados profissionais.

**Acceptance Criteria:**

**Given** um admin autenticado e autorizado
**When** ele fizer `POST /api/v1/collaborators` com dados validos do colaborador
**Then** a API deve retornar `201` com colaborador criado em envelope de sucesso
**And** o colaborador deve estar pronto para vinculo com usuario do sistema

**Given** um colaborador existente
**When** o admin fizer `PATCH /api/v1/collaborators/{collaborator_id}` para atualizar dados profissionais permitidos
**Then** a API deve retornar `200` com os dados atualizados
**And** validacoes de dominio devem ser aplicadas com erro padronizado em caso de falha

**Given** um departamento existente
**When** o admin fizer `POST /api/v1/collaborators/{collaborator_id}/department-links` informando `department_id`
**Then** a API deve retornar sucesso com associacao ativa colaborador-departamento
**And** deve impedir associacao invalida/duplicada conforme regra de negocio

**Given** um colaborador autenticado (nao admin)
**When** ele fizer `GET /api/v1/me/collaborator-profile`
**Then** a API deve retornar `200` apenas com os dados do seu proprio perfil profissional
**And** nao deve permitir acesso a perfis de outros colaboradores por esse endpoint

**Given** criacao/edicao de colaborador ou mudanca de associacao com departamento
**When** a operacao for concluida
**Then** deve existir evento de auditoria com `actor_id`, escopo e tipo de alteracao
**And** a resposta deve seguir envelope padrao com `correlation_id` em caso de erro

### Story 1.6: Painel RBAC por escopo com resolucao de conflitos

As a Admin/Superusuario,
I want visualizar e ajustar permissoes por escopo (`workspace`, `portfolio`, `project`, `board`) em um painel centralizado,
So that eu garanta acesso correto e rastreavel sem inconsistencias entre regras herdadas e especificas.

**Acceptance Criteria:**

**Given** um admin autenticado com acesso ao modulo de governanca
**When** ele fizer `GET /api/v1/permissions/matrix?workspace_id={id}` com filtros opcionais por escopo/usuario
**Then** a API deve retornar `200` com a matriz de permissoes vigente por escopo
**And** cada entrada deve indicar origem da regra (herdada ou especifica)

**Given** uma permissao especifica a ser aplicada em um escopo
**When** o admin fizer `POST /api/v1/permissions/assignments` com `subject`, `scope_type`, `scope_id`, `permission_key` e `effect`
**Then** a API deve criar/atualizar a regra e retornar sucesso
**And** a autorizacao efetiva deve refletir imediatamente em validacoes subsequentes

**Given** um conflito entre regra herdada e regra especifica
**When** o admin solicitar validacao via `POST /api/v1/permissions/conflicts/resolve-preview`
**Then** a API deve retornar o conflito detectado, impacto e opcoes de resolucao suportadas
**And** deve explicitar qual regra prevalecera em cada opcao

**Given** um conflito confirmado pelo admin
**When** ele aplicar a escolha em `POST /api/v1/permissions/conflicts/resolve`
**Then** a API deve persistir a resolucao escolhida e retornar estado final da permissao efetiva
**And** deve registrar evento de auditoria com antes/depois da decisao

**Given** uma tentativa de atribuir permissao fora do escopo autorizado do admin
**When** ele fizer operacao de criacao/edicao de regra
**Then** a API deve retornar `403` com envelope de erro padronizado e `correlation_id`
**And** nenhuma alteracao deve ser persistida

### Story 1.7: Aplicacao de permissoes em lote com auditoria completa

As a Admin/Superusuario,
I want aplicar permissoes em lote para multiplos usuarios/escopos com validacao previa,
So that eu reduza esforco operacional mantendo seguranca, consistencia e rastreabilidade.

**Acceptance Criteria:**

**Given** um admin autenticado no modulo de governanca
**When** ele fizer `POST /api/v1/permissions/bulk/preview` com uma lista de alteracoes em lote
**Then** a API deve retornar `200` com previa detalhada (itens validos, invalidos, conflitos e impacto estimado)
**And** nao deve persistir alteracoes nessa etapa

**Given** uma previa valida aprovada pelo admin
**When** ele fizer `POST /api/v1/permissions/bulk/apply` com o `preview_id` (ou payload assinado equivalente)
**Then** a API deve processar o lote com resultado por item
**And** deve retornar resumo com `processed`, `succeeded`, `failed` e lista de falhas

**Given** itens invalidos no lote (escopo inexistente, permissao invalida, sujeito inexistente ou fora do tenant)
**When** o admin executar a aplicacao do lote
**Then** os itens invalidos devem ser rejeitados com motivo explicito por item
**And** os itens validos devem seguir conforme politica definida no contrato (all-or-nothing ou parcial)

**Given** aplicacao em lote concluida
**When** o processamento terminar
**Then** deve existir registro de auditoria para cada alteracao efetivada e para o comando de lote
**And** cada evento deve conter `actor_id`, `workspace_id`, escopo, permissao alterada e antes/depois

**Given** tentativa de operacao em lote por usuario sem privilegio administrativo adequado
**When** ele fizer `POST /api/v1/permissions/bulk/preview` ou `POST /api/v1/permissions/bulk/apply`
**Then** a API deve retornar `403` com envelope de erro padronizado e `correlation_id`
**And** nenhuma alteracao deve ser aplicada

## Epic 2: Estrutura Operacional de Clientes e Projetos

Gestores conseguem estruturar a operacao ponta a ponta (cliente, workspace, portfolio e projeto), com status, cronograma e risco visiveis; incluindo alternancia rapida do status do cliente e criacao de workspace com associacao opcional.

### Story 2.1: CRUD de clientes com listagem e filtros por status

As a Gestor,
I want criar, editar, inativar e listar clientes com filtros operacionais,
So that eu mantenha a base de clientes organizada para planejamento da operacao.

**Acceptance Criteria:**

**Given** um gestor autenticado e autorizado
**When** ele fizer `POST /api/v1/clients` com dados validos
**Then** a API deve retornar `201` com cliente criado em envelope de sucesso
**And** o cliente deve iniciar com status valido conforme regra de dominio

**Given** clientes existentes
**When** o gestor fizer `GET /api/v1/clients?status=active&search={term}`
**Then** a API deve retornar `200` com lista paginada
**And** aplicar filtros por status e termo de busca de forma combinada

**Given** um cliente existente
**When** o gestor fizer `PATCH /api/v1/clients/{client_id}` com alteracoes validas
**Then** a API deve retornar `200` com dados atualizados
**And** manter consistencia de campos obrigatorios e validacoes de negocio

### Story 2.2: Detalhe de cliente com estatisticas consolidadas

As a Gestor,
I want visualizar detalhes e estatisticas consolidadas de um cliente,
So that eu acompanhe saude operacional e evolucao de entregas por conta.

**Acceptance Criteria:**

**Given** um cliente existente e dados relacionados no sistema
**When** o gestor fizer `GET /api/v1/clients/{client_id}`
**Then** a API deve retornar `200` com dados basicos do cliente
**And** incluir estatisticas consolidadas definidas no contrato (ex.: quantidade de projetos, concluidos, em risco)

**Given** um `client_id` inexistente ou fora de escopo autorizado
**When** o gestor consultar `GET /api/v1/clients/{client_id}`
**Then** a API deve retornar erro padronizado (`404` ou `403`) com `correlation_id`
**And** nao expor dados de outros escopos

### Story 2.3: CRUD de workspaces com associacao opcional a cliente

As a Gestor,
I want criar e manter workspaces com associacao opcional a cliente,
So that eu reflita a organizacao operacional real da agencia.

**Acceptance Criteria:**

**Given** um gestor autenticado
**When** ele fizer `POST /api/v1/workspaces` com payload valido, com ou sem `client_id`
**Then** a API deve retornar `201` com workspace criado
**And** a associacao com cliente deve ser opcional e validada quando informada

**Given** um workspace existente
**When** o gestor fizer `PATCH /api/v1/workspaces/{workspace_id}` para atualizar dados e associacoes permitidas
**Then** a API deve retornar `200` com dados atualizados
**And** impedir associacoes invalidas com erro padronizado

**Given** tentativa de exclusao de workspace com dependencias bloqueantes
**When** o gestor fizer `DELETE /api/v1/workspaces/{workspace_id}`
**Then** a API deve retornar erro de regra de negocio com orientacao
**And** manter integridade referencial do dominio

### Story 2.4: CRUD de portfolios vinculados a workspace

As a Gestor,
I want criar, editar e excluir portfolios vinculados a workspaces,
So that eu organize frentes estrategicas dentro da estrutura operacional.

**Acceptance Criteria:**

**Given** um workspace valido no escopo do gestor
**When** ele fizer `POST /api/v1/portfolios` informando `workspace_id`
**Then** a API deve retornar `201` com portfolio criado e vinculado
**And** rejeitar `workspace_id` invalido ou sem permissao com erro padronizado

**Given** um portfolio existente
**When** o gestor fizer `PATCH /api/v1/portfolios/{portfolio_id}`
**Then** a API deve retornar `200` com dados atualizados
**And** preservar vinculos e regras de escopo

### Story 2.5: CRUD de projetos vinculados a cliente e/ou portfolio

As a Gestor,
I want criar, editar e excluir projetos vinculados ao contexto correto,
So that cada entrega fique conectada a cliente e estrutura de portfolio.

**Acceptance Criteria:**

**Given** cliente e/ou portfolio validos no escopo
**When** o gestor fizer `POST /api/v1/projects` com payload valido
**Then** a API deve retornar `201` com projeto criado
**And** o projeto deve manter vinculacao coerente com `workspace_id` e hierarquia

**Given** um projeto existente
**When** o gestor fizer `PATCH /api/v1/projects/{project_id}`
**Then** a API deve retornar `200` com alteracoes aplicadas
**And** validar mudancas de vinculo para evitar quebra de consistencia hierarquica

### Story 2.6: Atualizacao de status e cronograma real de projetos

As a Gestor,
I want atualizar status e cronograma real do projeto,
So that eu mantenha previsibilidade e comunique situacao atual da entrega.

**Acceptance Criteria:**

**Given** um projeto existente
**When** o gestor fizer `PATCH /api/v1/projects/{project_id}/status` com status valido
**Then** a API deve retornar `200` com novo status aplicado
**And** registrar alteracao para trilha de auditoria

**Given** um projeto existente
**When** o gestor fizer `PATCH /api/v1/projects/{project_id}/schedule` com datas reais validas
**Then** a API deve atualizar cronograma e retornar `200`
**And** rejeitar combinacoes invalidas de datas com erro padronizado

### Story 2.7: Calculo e exibicao de progresso e risco de projeto

As a Gestor,
I want visualizar indicadores de progresso e risco do projeto,
So that eu antecipe desvios e priorize acoes corretivas.

**Acceptance Criteria:**

**Given** um projeto com tarefas e estados associados
**When** o gestor fizer `GET /api/v1/projects/{project_id}/metrics`
**Then** a API deve retornar `200` com indicadores de progresso e risco conforme contrato
**And** os calculos devem considerar regras de negocio definidas (status, prazos e volume concluido)

**Given** alteracoes relevantes no projeto/tarefas
**When** os indicadores forem consultados novamente
**Then** o resultado deve refletir o estado mais recente
**And** manter consistencia entre visao de projeto e visoes derivadas

### Story 2.8: Alternancia rapida de status de cliente por endpoint dedicado

As a Gestor,
I want alternar rapidamente o status do cliente (ativo/inativo),
So that eu execute mudancas operacionais sem atrito e com rastreabilidade.

**Acceptance Criteria:**

**Given** um cliente existente no escopo do gestor
**When** ele fizer `POST /api/v1/clients/{client_id}/status-toggle`
**Then** a API deve alternar o status entre `active` e `inactive` e retornar `200`
**And** retornar o novo status no envelope de sucesso

**Given** tentativa de alternar cliente fora do escopo autorizado
**When** o gestor chamar `POST /api/v1/clients/{client_id}/status-toggle`
**Then** a API deve retornar `403` com erro padronizado e `correlation_id`
**And** nao alterar o estado do cliente

**Given** alternancia de status concluida
**When** a operacao for confirmada
**Then** deve haver registro de auditoria da mudanca com antes/depois e `actor_id`
**And** listagens e filtros de clientes devem refletir o novo estado imediatamente

## Epic 3: Execucao de Trabalho em Boards e Tarefas

Times conseguem planejar e executar tarefas em lista/kanban/timeline, com dependencias, historico e consistencia operacional.

### Story 3.1: Criacao de board vinculado ao projeto

As a Gestor,
I want criar boards vinculados a um projeto,
So that eu organize o fluxo operacional de execucao por contexto de entrega.

**Acceptance Criteria:**

**Given** um projeto existente no escopo autorizado
**When** o gestor fizer `POST /api/v1/boards` com `project_id` e dados validos
**Then** a API deve retornar `201` com board criado
**And** o board deve ficar associado corretamente ao projeto e ao `workspace_id`

**Given** um `project_id` invalido ou fora do escopo
**When** o gestor tentar criar o board
**Then** a API deve retornar erro padronizado com `correlation_id`
**And** nenhuma entidade deve ser persistida

### Story 3.2: Gestao de grupos no board (criar, editar, excluir, reordenar e WIP)

As a Gestor,
I want manter grupos dentro do board e definir ordem e WIP por grupo,
So that eu controle o fluxo de trabalho e limites de execucao simultanea.

**Acceptance Criteria:**

**Given** um board existente
**When** o gestor fizer `POST /api/v1/boards/{board_id}/groups` com dados validos
**Then** a API deve retornar `201` com grupo criado no board
**And** o grupo deve receber posicao inicial coerente

**Given** grupos existentes no board
**When** o gestor fizer `PATCH /api/v1/groups/{group_id}` alterando nome, ordem ou `wip_limit`
**Then** a API deve retornar `200` com grupo atualizado
**And** a reordenacao deve manter sequencia consistente sem colisoes

**Given** tentativa de definir `wip_limit` invalido
**When** o gestor atualizar o grupo
**Then** a API deve retornar erro padronizado de validacao
**And** nao deve alterar o valor previamente valido

### Story 3.3: Visualizacao de board em lista, kanban e timeline

As a Usuario autorizado,
I want alternar entre modos lista, kanban e timeline no board,
So that eu acompanhe trabalho no formato mais adequado para analise e decisao.

**Acceptance Criteria:**

**Given** um board com grupos e tarefas
**When** o usuario fizer `GET /api/v1/boards/{board_id}?view=list`
**Then** a API deve retornar dados estruturados para visualizacao em lista
**And** incluir metadados minimos de ordenacao e status

**Given** o mesmo board
**When** o usuario fizer `GET /api/v1/boards/{board_id}?view=kanban`
**Then** a API deve retornar tarefas agrupadas por grupo/status para renderizacao kanban
**And** preservar consistencia de contagem e progresso

**Given** um usuario autorizado para timeline
**When** fizer `GET /api/v1/boards/{board_id}?view=timeline`
**Then** a API deve retornar tarefas com dados temporais necessarios ao cronograma
**And** bloquear acesso com erro padronizado caso perfil nao tenha permissao para timeline

### Story 3.4: Criacao e edicao de tarefas com atributos operacionais

As a Usuario autorizado,
I want criar e editar tarefas com status, prioridade, cronograma e esforco,
So that eu mantenha o trabalho planejado e rastreavel no fluxo operacional.

**Acceptance Criteria:**

**Given** um grupo valido em board autorizado
**When** o usuario fizer `POST /api/v1/tasks` com campos obrigatorios validos
**Then** a API deve retornar `201` com tarefa criada
**And** a tarefa deve conter vinculos corretos com board/grupo/projeto/workspace

**Given** uma tarefa existente
**When** o usuario fizer `PATCH /api/v1/tasks/{task_id}` alterando atributos permitidos
**Then** a API deve retornar `200` com dados atualizados
**And** validar combinacoes de prioridade/status/datas conforme regra de negocio

### Story 3.5: Atribuicao de responsavel e filtro de Minhas Tarefas

As a Usuario autorizado,
I want atribuir responsavel na tarefa e filtrar Minhas Tarefas,
So that cada colaborador acompanhe seu backlog operacional com clareza.

**Acceptance Criteria:**

**Given** uma tarefa e um colaborador validos no mesmo escopo
**When** o usuario fizer `PATCH /api/v1/tasks/{task_id}/assignee` com `assignee_id`
**Then** a API deve retornar `200` com novo responsavel atribuido
**And** deve validar permissao e compatibilidade de escopo

**Given** um usuario autenticado
**When** fizer `GET /api/v1/my-tasks` com filtros de status, prioridade e prazo
**Then** a API deve retornar `200` com lista paginada somente das tarefas do proprio usuario
**And** aplicar filtros combinados de forma consistente

### Story 3.6: Dependencias entre tarefas e recalculo de datas

As a Usuario autorizado,
I want definir dependencias entre tarefas com recalculo de cronograma,
So that o plano de entrega reflita impactos reais de bloqueios e atrasos.

**Acceptance Criteria:**

**Given** duas tarefas validas no mesmo contexto de projeto
**When** o usuario fizer `POST /api/v1/tasks/{task_id}/dependencies` informando tarefa predecessora
**Then** a API deve criar dependencia valida e retornar `201`
**And** impedir dependencia circular com erro padronizado

**Given** uma dependencia ativa e alteracao relevante de data/status na predecessora
**When** o sistema recalcular cronograma
**Then** as datas da tarefa dependente devem ser ajustadas conforme regra configurada
**And** a alteracao deve ficar registrada no historico da tarefa

### Story 3.7: Atualizacao de status pelo TaskDrawerPanel com bloqueios claros

As a Colaborador/Coordenador,
I want atualizar status da tarefa pelo `TaskDrawerPanel` com feedback imediato,
So that eu execute acoes de alta frequencia sem sair do contexto da tela principal.

**Acceptance Criteria:**

**Given** uma tarefa aberta no `TaskDrawerPanel`
**When** o usuario fizer alteracao de status valida
**Then** a API deve retornar sucesso imediato com estado atualizado da tarefa
**And** a resposta deve conter dados para alimentar `OperationalStatusBadge` e historico

**Given** uma alteracao de status bloqueada por regra critica
**When** o usuario tentar confirmar a acao
**Then** a API deve retornar erro de regra de negocio com causa e acao recomendada
**And** o frontend deve conseguir manter o drawer aberto com mensagem orientada a resolucao

### Story 3.8: Comentarios contextuais e anexos na tarefa

As a Usuario autorizado,
I want registrar comentarios e anexar arquivos na tarefa,
So that o contexto de execucao fique centralizado e auditavel.

**Acceptance Criteria:**

**Given** uma tarefa existente e permissao de escrita
**When** o usuario fizer `POST /api/v1/tasks/{task_id}/comments` com conteudo valido
**Then** a API deve retornar `201` com comentario criado
**And** vincular autor, timestamp e contexto da tarefa

**Given** uma tarefa existente
**When** o usuario fizer upload via `POST /api/v1/tasks/{task_id}/attachments`
**Then** a API deve retornar `201` com metadados do anexo
**And** validar tipo/tamanho conforme politica definida

### Story 3.9: Historico de atividade e progresso do board

As a Coordenador/Gestor,
I want consultar historico de atividade da tarefa e progresso agregado do board,
So that eu acompanhe evolucao operacional e identifique gargalos rapidamente.

**Acceptance Criteria:**

**Given** uma tarefa com alteracoes registradas
**When** o usuario fizer `GET /api/v1/tasks/{task_id}/activity`
**Then** a API deve retornar `200` com trilha cronologica de eventos relevantes
**And** incluir mudancas de status, atribuicao, comentarios e dependencias

**Given** um board com tarefas em diferentes estados
**When** o usuario fizer `GET /api/v1/boards/{board_id}/progress`
**Then** a API deve retornar `200` com percentual e contagens por estado
**And** os calculos devem ser coerentes com o conjunto atual de tarefas

## Epic 4: Controle de Tempo e Produtividade Operacional

Colaboradores registram tempo na tarefa (iniciar/pausar/retomar/concluir), editam/excluem logs e consolidam o tempo para analise operacional.

### Story 4.1: Iniciar, pausar e retomar cronometro de tarefa

As a Colaborador,
I want iniciar, pausar e retomar o cronometro diretamente na tarefa,
So that eu registre meu esforco real sem friccao durante a execucao.

**Acceptance Criteria:**

**Given** uma tarefa elegivel para apontamento de tempo
**When** eu fizer `POST /api/v1/tasks/{task_id}/time/start`
**Then** a API deve retornar `200` com sessao de tempo ativa
**And** impedir inicio duplicado se ja houver sessao ativa para a tarefa/usuario

**Given** uma sessao de tempo ativa
**When** eu fizer `POST /api/v1/tasks/{task_id}/time/pause`
**Then** a API deve registrar a pausa e retornar `200`
**And** manter rastreabilidade do intervalo apontado

**Given** uma sessao pausada
**When** eu fizer `POST /api/v1/tasks/{task_id}/time/resume`
**Then** a API deve reativar o apontamento e retornar `200`
**And** preservar historico completo da sessao

### Story 4.2: Concluir tarefa com encerramento de apontamento

As a Colaborador,
I want concluir tarefa encerrando o cronometro ativo,
So that o fechamento da atividade fique consistente entre status e tempo registrado.

**Acceptance Criteria:**

**Given** uma tarefa em execucao com sessao de tempo ativa
**When** eu fizer `POST /api/v1/tasks/{task_id}/complete`
**Then** a API deve encerrar a sessao ativa e atualizar status de conclusao
**And** registrar data/hora de conclusao da tarefa

**Given** tentativa de concluir tarefa bloqueada por regra de negocio
**When** eu chamar `POST /api/v1/tasks/{task_id}/complete`
**Then** a API deve retornar erro padronizado com causa e `correlation_id`
**And** manter estado anterior da tarefa e do tempo

### Story 4.3: Editar e excluir logs de sessao de tempo

As a Usuario autorizado,
I want editar e excluir logs de sessao quando necessario,
So that eu corrija apontamentos incorretos mantendo integridade de auditoria.

**Acceptance Criteria:**

**Given** um log de tempo existente e permissao adequada
**When** eu fizer `PATCH /api/v1/time-logs/{time_log_id}` com valores validos
**Then** a API deve retornar `200` com log atualizado
**And** validar regras de consistencia (inicio < fim, sem duracao negativa)

**Given** um log de tempo existente
**When** eu fizer `DELETE /api/v1/time-logs/{time_log_id}`
**Then** a API deve remover/inativar o log conforme politica do dominio
**And** registrar trilha de auditoria com antes/depois

### Story 4.4: Consolidacao de tempo por tarefa para analise operacional

As a Coordenador/Gestor,
I want consultar consolidado de tempo por tarefa,
So that eu tenha visibilidade de produtividade e previsibilidade de entrega.

**Acceptance Criteria:**

**Given** tarefas com logs de tempo registrados
**When** eu fizer `GET /api/v1/tasks/{task_id}/time-summary`
**Then** a API deve retornar `200` com total consolidado e detalhamento minimo por periodo/sessao
**And** os valores devem refletir correcoes de logs feitas anteriormente

**Given** filtros operacionais aplicados
**When** eu fizer `GET /api/v1/time-logs?workspace_id={id}&from={date}&to={date}`
**Then** a API deve retornar colecao paginada e filtrada
**And** respeitar isolamento de tenant e permissao de escopo

## Epic 5: Alertas e Comunicacao Operacional Assincrona

Usuarios recebem alertas acionaveis (designacao, conclusao, atraso e prazo proximo) e gerenciam leitura/contadores em central de notificacoes.

### Story 5.1: Notificacao por designacao de responsavel

As a Colaborador,
I want ser notificado quando for designado em uma tarefa,
So that eu saiba rapidamente que uma nova demanda entrou no meu escopo.

**Acceptance Criteria:**

**Given** uma tarefa com responsavel atualizado
**When** ocorrer designacao de um colaborador
**Then** o sistema deve enfileirar evento assincrono de notificacao
**And** criar item de notificacao para o usuario designado

**Given** falha transitoria no processamento da fila
**When** o worker processar a notificacao
**Then** deve aplicar retry/backoff conforme politica definida
**And** manter rastreabilidade por `correlation_id`

### Story 5.2: Notificacao de conclusao para usuarios relevantes

As a Coordenador/Gestor,
I want receber notificacao de conclusao de tarefa relevante,
So that eu acompanhe progresso sem monitoramento manual continuo.

**Acceptance Criteria:**

**Given** uma tarefa concluida com sucesso
**When** o evento de conclusao for publicado
**Then** o sistema deve notificar os destinatarios configurados (ex.: responsavel, coordenador, watchers)
**And** registrar resultado de entrega da notificacao

**Given** regras de preferencia de notificacao por usuario
**When** o evento for processado
**Then** o canal/forma de notificacao deve respeitar configuracao valida
**And** manter fallback definido para central interna

### Story 5.3: Notificacoes assincronas de atraso e prazo proximo

As a Coordenador,
I want receber alertas automaticos de atraso e prazo proximo,
So that eu consiga agir antes do comprometimento da entrega.

**Acceptance Criteria:**

**Given** tarefas com prazo configurado
**When** rotina assincrona identificar tarefa atrasada
**Then** deve gerar notificacao de atraso com severidade apropriada
**And** evitar duplicacao excessiva do mesmo alerta em janela curta

**Given** tarefas com vencimento proximo
**When** rotina identificar proximidade de prazo conforme regra
**Then** deve gerar notificacao preventiva com contexto e acao recomendada
**And** vincular a notificacao ao recurso alvo (tarefa/projeto)

### Story 5.4: Central de notificacoes com marcacao de leitura

As a Usuario autenticado,
I want visualizar central de notificacoes e marcar itens como lidos,
So that eu gerencie meu backlog de alertas operacionais.

**Acceptance Criteria:**

**Given** notificacoes existentes para o usuario
**When** ele fizer `GET /api/v1/notifications`
**Then** a API deve retornar `200` com lista paginada ordenada por recencia
**And** incluir estado de leitura e metadados de acao

**Given** uma notificacao nao lida
**When** o usuario fizer `POST /api/v1/notifications/{notification_id}/read`
**Then** a API deve marcar item como lido e retornar `200`
**And** impedir alteracao de notificacao de outro usuario

### Story 5.5: Contador de notificacoes nao lidas

As a Usuario autenticado,
I want visualizar contador de notificacoes nao lidas,
So that eu priorize rapidamente pendencias de comunicacao operacional.

**Acceptance Criteria:**

**Given** notificacoes do usuario em diferentes estados
**When** ele fizer `GET /api/v1/notifications/unread-count`
**Then** a API deve retornar `200` com total de nao lidas
**And** manter consistencia com marcacoes de leitura recentes

**Given** mudanca de estado (leitura/nova notificacao)
**When** o contador for consultado novamente
**Then** o valor deve refletir o estado mais atual
**And** responder dentro dos limites de performance definidos

## Epic 6: Auditoria, API e Observabilidade de Plataforma

Superusuarios auditarao eventos criticos e operarao a plataforma via APIs e health check, com endpoints e metricas essenciais para suporte e estabilidade.

### Story 6.1: Registro de eventos CRUD criticos

As a Superusuario,
I want que eventos CRUD criticos sejam registrados automaticamente,
So that eu tenha trilha confiavel para investigacao e compliance operacional.

**Acceptance Criteria:**

**Given** operacoes de criacao, atualizacao ou exclusao em entidades criticas
**When** a transacao for concluida
**Then** o sistema deve registrar evento de auditoria com `actor_id`, `workspace_id`, entidade, acao e timestamp
**And** incluir snapshot minimo de antes/depois quando aplicavel

### Story 6.2: Registro de eventos de autenticacao

As a Superusuario,
I want registrar login, falha e logout de autenticacao,
So that eu monitore seguranca de acesso administrativo e operacional.

**Acceptance Criteria:**

**Given** tentativa de login (sucesso ou falha) e logout
**When** o evento ocorrer
**Then** o sistema deve persistir log de autenticacao com tipo de evento e contexto minimo
**And** associar `correlation_id` para rastreabilidade ponta a ponta

### Story 6.3: Registro de eventos de controle de tempo

As a Superusuario,
I want auditar eventos de start/pause/resume/complete de tempo,
So that eu garanta rastreabilidade operacional do esforco registrado.

**Acceptance Criteria:**

**Given** qualquer acao de tempo em tarefa
**When** a acao for processada com sucesso
**Then** deve ser gerado evento de auditoria com tipo e referencia da tarefa/sessao
**And** os eventos devem ser consultaveis por filtros operacionais

### Story 6.4: Dashboard e listagem filtravel de logs

As a Superusuario,
I want visualizar dashboard de logs e listar eventos com filtros,
So that eu investigue incidentes e acompanhe saude operacional.

**Acceptance Criteria:**

**Given** logs existentes na base de auditoria
**When** o superusuario fizer `GET /api/v1/audit/dashboard`
**Then** a API deve retornar `200` com estatisticas agregadas do periodo
**And** incluir indicadores minimos para analise (volume por tipo, falhas, distribuicao temporal)

**Given** necessidade de investigacao detalhada
**When** o superusuario fizer `GET /api/v1/audit/logs` com filtros (ator, tipo, escopo, periodo)
**Then** a API deve retornar lista paginada filtrada
**And** manter performance dentro dos limites definidos

### Story 6.5: Endpoints CRUD e de acoes especificas para entidades principais

As a Integrador interno (frontend),
I want consumir endpoints CRUD padronizados e endpoints de acoes de dominio,
So that a aplicacao web opere com contratos estaveis e previsiveis.

**Acceptance Criteria:**

**Given** entidades principais do dominio
**When** o frontend consumir endpoints em `/api/v1/...`
**Then** as respostas devem seguir envelope padrao de sucesso/erro
**And** usar naming e semantica definidos na arquitetura

**Given** acoes especificas (tempo, status, dependencias)
**When** endpoints dedicados forem acionados
**Then** devem validar autorizacao e regras de negocio corretamente
**And** retornar erros padronizados com `correlation_id` em falhas

### Story 6.6: Endpoints de estatisticas para projeto, portfolio e workspace

As a Gestor/Coordenador,
I want consultar estatisticas consolidadas por niveis da hierarquia,
So that eu faca analise gerencial com base confiavel de dados.

**Acceptance Criteria:**

**Given** dados operacionais disponiveis
**When** usuario autorizado fizer `GET /api/v1/workspaces/{workspace_id}/stats`, `GET /api/v1/portfolios/{portfolio_id}/stats` ou `GET /api/v1/projects/{project_id}/stats`
**Then** a API deve retornar `200` com estatisticas coerentes ao escopo solicitado
**And** impedir vazamento entre tenants/escopos

### Story 6.7: Endpoint de health check para monitoramento

As a Operador de plataforma,
I want um endpoint de health check padronizado,
So that eu monitore disponibilidade e readiness do sistema em runtime.

**Acceptance Criteria:**

**Given** a API em execucao
**When** for chamado `GET /api/v1/health`
**Then** a API deve retornar `200` quando dependencias essenciais estiverem saudaveis
**And** retornar estado degradado/falha com codigo apropriado quando dependencia critica indisponivel

**Given** verificacao de ambiente operacional
**When** o endpoint for consultado por sistemas de monitoramento
**Then** a resposta deve incluir campos minimos de status e timestamp
**And** nao expor informacoes sensiveis de infraestrutura
