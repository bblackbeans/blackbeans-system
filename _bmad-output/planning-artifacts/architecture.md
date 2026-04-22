---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/prd.md"
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/product-brief-blackbeans-system.md"
  - "/home/kaue-ronald/Área de trabalho/blackbeans-system/_bmad-output/planning-artifacts/ux-design-specification.md"
workflowType: "architecture"
lastStep: 8
status: "complete"
completedAt: "2026-04-15"
project_name: "blackbeans-system"
user_name: "kaue-ronald"
date: "2026-04-15"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
O projeto possui alto volume de requisitos funcionais cobrindo ponta a ponta da operacao: identidade/acesso, estrutura organizacional (`Workspace > Portfolio > Project > Board > Group > Task`), execucao de tarefas, tempo/produtividade, notificacoes assincronas, permissoes granulares, auditoria e API de produto.
Arquiteturalmente, isso implica separacao clara de dominios, contratos consistentes entre modulos e forte coordenacao entre regras de negocio transversais (status, prazo, dependencia, permissao e tempo).

**Non-Functional Requirements:**
Os NFRs exigem:
- desempenho com metas p95 para leitura/escrita;
- seguranca robusta (TLS, criptografia em repouso, RBAC por escopo, 2FA admin);
- escalabilidade inicial multi-tenant;
- acessibilidade WCAG AA;
- integracoes iniciais de notificacao com base para evolucao.
Esses requisitos vao direcionar escolhas de arquitetura em observabilidade, isolamento de dados, autorizacao, processamento assincrono e contratos de API.

**Scale & Complexity:**
A complexidade do projeto e **alta** para V1, pela combinacao de:
- escopo funcional amplo;
- governanca (RBAC + auditoria) como requisito nativo;
- fluxos operacionais em tempo real percebido;
- notificacoes/eventos assincronos;
- consistencia entre UX densa e regras de negocio.

- Primary domain: SaaS B2B web operational management
- Complexity level: high
- Estimated architectural components: 12-16 macrocomponentes (dominio, plataforma, integracao, suporte operacional)

### Technical Constraints & Dependencies

- Modelo multi-tenant logico por workspace/agencia.
- Autorizacao por escopo hierarquico e por acao.
- Necessidade de processamento assincrono para alertas de prazo/atraso e eventos operacionais.
- Auditoria obrigatoria para CRUD critico, autenticacao, permissoes e tempo.
- API REST como interface principal da plataforma.
- Dependencia forte entre modulos de execucao (tarefas/tempo/dependencias) e governanca (permissoes/auditoria).

### Cross-Cutting Concerns Identified

- Identity & Access Management (autenticacao, autorizacao, 2FA, sessao)
- Multi-tenancy e isolamento de dados
- Observabilidade (logs, metricas, tracing, health checks)
- Auditoria e trilha imutavel de eventos sensiveis
- Resiliencia de jobs assincronos e idempotencia
- Padronizacao de erros e contratos de API
- Performance e cache para visoes operacionais densas
- Acessibilidade e consistencia de UX em fluxos criticos

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web SaaS B2B com backend dominante em regras de negocio e governanca (API-first + frontend React/Next.js).

### Starter Options Considered

1. **Django baseline oficial**
- Comando: `django-admin startproject`
- Pro: minimo, limpo, sem opinioes.
- Contra: exige montar praticamente tudo (seguranca, estrutura, DX, deploy) manualmente.

2. **Cookiecutter Django (recomendado)**
- Projeto ativo e mantido.
- Release recente: `2026.04.03`.
- Base orientada a producao, com suporte Docker, Postgres, estrutura de settings e opcoes para Celery.
- Permite escolher DRF no scaffolding.

3. **NestJS starter (alternativa)**
- CLI moderna e estrutura enterprise.
- Pro: excelente para times TS.
- Contra: menor vantagem para seu contexto de governanca administrativa e stack Python ja alinhada.

### Selected Starter: cookiecutter-django

**Rationale for Selection:**
- Melhor aderencia ao contexto do projeto (governanca, RBAC, auditoria e dominio relacional forte).
- Foundation de producao mais completa que `startproject`.
- Compatibilidade direta com PostgreSQL, Docker e opcao de Celery.
- Reduz decisoes repetitivas iniciais e acelera consistencia arquitetural.

**Initialization Command:**

```bash
uv tool install "cookiecutter>=1.7.0"
uvx cookiecutter https://github.com/cookiecutter/cookiecutter-django
```

**Sugestoes de respostas no scaffold:**
- `rest_api`: `DRF`
- `use_docker`: `y`
- `use_celery`: `y`
- `postgresql_version`: versao suportada mais recente no ambiente-alvo
- `cloud_provider`: `None` (para VPS Docker inicial)

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- Python + Django moderno (template alinhado com Django 6.x).
- Estrutura pronta para APIs com DRF.

**Styling Solution:**
- Backend server-rendered opcional; frontend principal seguira separado em Next.js.
- Mantem desacoplamento claro API x UI.

**Build Tooling:**
- Setup de ambiente e composicao de servicos com Docker.
- Estrutura de configuracao por ambiente (12-factor style).

**Testing Framework:**
- Base de testes pronta no projeto gerado.
- Facilita acoplamento com pipeline CI desde o inicio.

**Code Organization:**
- Separacao por apps/modulos Django.
- Base robusta para dominios centrais (IAM, Clientes, Projetos, Tarefas, Governanca).

**Development Experience:**
- Setup mais previsivel para equipe.
- Menos custo de bootstrapping tecnico inicial.

### Frontend Starter (complementar ao backend)

Para o frontend, manter:

```bash
npx create-next-app@latest blackbeans-web --yes
```

Com TypeScript (default), App Router e base moderna para integrar com API DRF.

### Async & Infra Confirmados

- **Fila/Jobs:** Celery + Redis
- **Banco:** PostgreSQL
- **Deploy inicial:** Docker + VPS

**Note:** Inicializacao desses starters deve entrar como primeiras historias tecnicas de implementacao.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Estrategia de multi-tenant: single database + shared schema + `workspace_id` como escopo obrigatorio.
- Autenticacao/autorizacao: Django auth + JWT + RBAC por escopo hierarquico.
- Contrato de API: REST versionado (`/api/v1`) com erro padronizado.
- Processamento assincrono: Celery + Redis com idempotencia e retry/backoff.
- Infra inicial: Docker com servicos separados para frontend e backend em VPS.

**Important Decisions (Shape Architecture):**
- Estrategia de cache operacional com Redis para leituras de dashboard e contadores.
- Frontend modular com Next.js + TypeScript + componentes de dominio sobre Ant Design.
- Observabilidade com logs estruturados, correlation_id, metricas e health checks.
- Politica de migrations e constraints em camadas para integridade.

**Deferred Decisions (Post-MVP):**
- Evolucao para arquitetura de servicos separados por dominio (se crescimento exigir).
- Introducao de event bus externo dedicado (alem do broker Redis).
- Feature flags avançadas e rollout multiversao mais sofisticado.

### Data Architecture

- **Modelo multi-tenant:** `workspace_id` obrigatorio em entidades de dominio e escopo aplicado em toda consulta.
- **Chaves e modelagem:** UUID como identificador externo padrao; indices compostos com `workspace_id` para consultas criticas.
- **Validacao em 3 camadas:** entrada (serializer/schema), regra de dominio (service layer), integridade final (constraints DB).
- **Migrations:** fluxo Django migrations com revisao obrigatoria; SQL manual apenas com justificativa arquitetural.
- **Cache:** Redis com expiracao curta e invalidacao orientada por eventos de escrita.

### Authentication & Security

- **Autenticacao:** Django auth + JWT (access curto, refresh rotativo).
- **2FA:** obrigatorio para perfis administrativos.
- **Autorizacao:** RBAC por escopo (`workspace`, `portfolio`, `project`, `board`) com policy checks centralizados.
- **Seguranca de API:** rate limit por classe de endpoint, protecao brute-force em login, headers de seguranca e CORS restritivo por ambiente.
- **Criptografia:** TLS em transito, dados sensiveis cifrados em repouso e segredos via variaveis de ambiente.
- **Auditoria de seguranca:** log estruturado para login/falha/logout, alteracoes de permissao e acoes criticas.

### API & Communication Patterns

- **Padrao principal:** REST versionado por prefixo (`/api/v1/...`).
- **Documentacao:** OpenAPI gerado automaticamente e versionado.
- **Erros:** envelope padronizado com `code`, `message`, `details`, `correlation_id`.
- **Rate limiting:** politicas por usuario/IP e por criticidade de endpoint.
- **Assincrono:** Celery + Redis para notificacoes, alertas de prazo e tarefas operacionais.
- **Resiliencia de jobs:** idempotencia, retry/backoff e trilha de falhas para reprocessamento.

### Frontend Architecture

- **Base:** Next.js + TypeScript (App Router) + Ant Design + camada de componentes de dominio.
- **Estado:** separacao entre server state e UI state; evitar estado global desnecessario.
- **Estrutura:** `design-system`, `domain-components`, `feature-modules` por contexto de negocio.
- **Roteamento:** rotas por contexto operacional com guardas por perfil/escopo (backend permanece fonte da autorizacao final).
- **Performance:** virtualizacao para listas densas, carregamento incremental e code splitting por modulo.

### Infrastructure & Deployment

- **Servicos separados em Docker:** frontend, backend, worker, redis, postgres e reverse proxy.
- **Separacao front/back confirmada:** frontend em container proprio e backend em container proprio para deploy e escala independentes.
- **Ambientes:** `dev`, `staging`, `prod` com configuracoes segregadas.
- **Deploy:** imagens versionadas, migracoes controladas no release e estrategia de rollback.
- **Observabilidade:** logs estruturados, metricas por servico, health/readiness checks e alertas minimos.
- **Escalabilidade inicial:** escala horizontal prioritaria para API/worker, com tuning progressivo de DB e cache.

### Decision Impact Analysis

**Implementation Sequence:**
1. Inicializar repositorios base (backend/frontend) e stack Docker.
2. Configurar IAM + RBAC + audit logging como fundacao transversal.
3. Estruturar API REST versionada e padrao de erros.
4. Implementar dominio core (clientes, estrutura, projetos, tarefas).
5. Ativar pipeline assincrono (Celery/Redis) para notificacoes e eventos.
6. Consolidar observabilidade, testes e hardening de deploy.

**Cross-Component Dependencies:**
- RBAC influencia API, frontend e jobs assincronos.
- Modelo multi-tenant impacta queries, indices, cache e auditoria.
- Padrao de erro e correlation_id conecta API, frontend, logs e suporte operacional.
- Decisoes de infraestrutura orientam limites de performance e estrategia de escalabilidade.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
5 areas onde agentes de IA poderiam divergir e gerar inconsistencias: naming, estrutura, formato de API, comunicacao/eventos e processos de erro/loading.

### Naming Patterns

**Database Naming Conventions:**
- Tabelas e colunas em `snake_case`.
- Chaves estrangeiras no formato `<entidade>_id` (ex.: `workspace_id`).
- Indices no formato `idx_<tabela>_<campo>` (ex.: `idx_tasks_workspace_id`).

**API Naming Conventions:**
- Endpoints REST em plural (ex.: `/api/v1/tasks`, `/api/v1/projects`).
- Parametros de rota em `snake_case` quando refletirem nomes tecnicos.
- Query params em `snake_case` para consistencia com backend.

**Code Naming Conventions:**
- Frontend: componentes em `PascalCase`, funcoes/variaveis em `camelCase`.
- Backend Python: funcoes e variaveis em `snake_case`, classes em `PascalCase`.
- Arquivos frontend em `kebab-case`; modulos backend por dominio em nomes curtos e explicitos.

### Structure Patterns

**Project Organization:**
- Backend organizado por apps de dominio (`iam`, `clients`, `projects`, `tasks`, `governance`, etc.).
- Frontend organizado por `feature-modules`, `domain-components` e `design-system`.
- Separacao clara entre camada de dominio, API, infraestrutura e utilitarios compartilhados.

**File Structure Patterns:**
- Configuracoes por ambiente separadas (`dev`, `staging`, `prod`).
- Contratos de API/documentacao em local unico e versionado.
- Scripts operacionais e automacoes em pasta dedicada para previsibilidade.

### Format Patterns

**API Response Formats:**
- Sucesso: `{ "data": ..., "meta": ... }`
- Erro: `{ "error": { "code": "...", "message": "...", "details": ... }, "correlation_id": "..." }`
- Datas em ISO-8601 UTC.

**Data Exchange Formats:**
- JSON com chaves em `snake_case` no backend.
- Mapeamento para frontend padronizado em camada de adaptacao quando necessario.
- Booleanos nativos (`true/false`) e `null` explicito para ausencia de valor.

### Communication Patterns

**Event System Patterns:**
- Eventos nomeados em `domain.action` (ex.: `task.updated`, `permission.changed`).
- Payload com `workspace_id`, `actor_id`, `entity_id`, `timestamp` e dados do evento.
- Workers idempotentes e rastreaveis por `correlation_id`.

**State Management Patterns:**
- Frontend separa server state de UI state.
- Atualizacoes de estado sempre previsiveis e sem mutacao implicita.
- Acoes de estado com nomes orientados a intencao de negocio.

### Process Patterns

**Error Handling Patterns:**
- Mensagens ao usuario com estrutura: causa + impacto + proxima acao.
- Erro de regra de negocio nao deve ser tratado como erro tecnico transitorio.
- Logs de erro estruturados com severidade e contexto minimo obrigatorio.

**Loading State Patterns:**
- Loading com skeleton em listas e paineis densos.
- Estados de carregamento locais por modulo para evitar bloqueio global desnecessario.
- Indicadores de progresso claros em operacoes assincronas relevantes.

### Enforcement Guidelines

**All AI Agents MUST:**
- Seguir naming e formatos definidos neste documento sem excecoes ad-hoc.
- Usar envelopes de resposta e erro padronizados em toda API.
- Preservar `workspace_id` e `correlation_id` em fluxos criticos e logs.

**Pattern Enforcement:**
- Revisao de PR com checklist de consistencia.
- Linters/formatters e testes de contrato para detectar desvios.
- Atualizacoes de padrao devem passar por decisao arquitetural registrada.

### Pattern Examples

**Good Examples:**
- Endpoint: `GET /api/v1/tasks?workspace_id=<uuid>`
- Erro: `{"error":{"code":"permission_denied","message":"...","details":{...}},"correlation_id":"..."}`
- Evento: `task.updated` com payload padronizado.

**Anti-Patterns:**
- Misturar `camelCase` e `snake_case` sem camada de adaptacao.
- Respostas de API sem padrao (ora objeto direto, ora envelope).
- Logs sem `workspace_id`/`correlation_id` em fluxos auditaveis.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
blackbeans-system/
├── README.md
├── .gitignore
├── .editorconfig
├── .env.example
├── docs/
│   ├── architecture/
│   │   ├── adr/
│   │   └── api-contracts/
│   ├── operational-runbooks/
│   └── onboarding/
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── web.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── nginx/
│   │       └── default.conf
│   ├── docker-compose.dev.yml
│   ├── docker-compose.staging.yml
│   ├── docker-compose.prod.yml
│   ├── scripts/
│   │   ├── deploy.sh
│   │   ├── migrate.sh
│   │   └── backup_db.sh
│   └── env/
│       ├── api.env.example
│       ├── web.env.example
│       └── worker.env.example
├── blackbeans-api/
│   ├── pyproject.toml
│   ├── manage.py
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── dev.txt
│   │   └── prod.txt
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   ├── staging.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   ├── wsgi.py
│   │   └── celery.py
│   ├── apps/
│   │   ├── iam/
│   │   ├── clients/
│   │   ├── portfolios/
│   │   ├── projects/
│   │   ├── boards/
│   │   ├── tasks/
│   │   ├── time_tracking/
│   │   ├── governance/
│   │   ├── notifications/
│   │   ├── audit/
│   │   └── metrics/
│   ├── common/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── tenancy/
│   │   ├── logging/
│   │   ├── exceptions/
│   │   └── utils/
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── contracts/
├── blackbeans-web/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── .env.local.example
│   ├── src/
│   │   ├── app/
│   │   │   ├── (workspace)/
│   │   │   ├── api/
│   │   │   └── layout.tsx
│   │   ├── design-system/
│   │   │   ├── tokens/
│   │   │   └── primitives/
│   │   ├── domain-components/
│   │   │   ├── task-drawer-panel/
│   │   │   ├── operational-status-badge/
│   │   │   ├── capacity-chip/
│   │   │   ├── notification-action-item/
│   │   │   └── audit-timeline-panel/
│   │   ├── features/
│   │   │   ├── iam/
│   │   │   ├── clients/
│   │   │   ├── projects/
│   │   │   ├── tasks/
│   │   │   ├── governance/
│   │   │   └── notifications/
│   │   ├── services/
│   │   ├── state/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   └── public/
│       └── assets/
└── .github/
    └── workflows/
        ├── api-ci.yml
        ├── web-ci.yml
        └── deploy.yml
```

### Architectural Boundaries

**API Boundaries:**
- O frontend comunica exclusivamente com `blackbeans-api` via `/api/v1/...`.
- Nenhum acesso direto ao banco fora da API/backend.
- Autenticacao e autorizacao centralizadas no backend com escopo multi-tenant.

**Component Boundaries:**
- `design-system`: componentes base e tokens.
- `domain-components`: componentes reutilizaveis de negocio.
- `features`: composicao por contexto funcional (tarefas, governanca, etc.).

**Service Boundaries:**
- Backend por apps de dominio com contratos explicitos.
- Regras transversais em `common` (tenancy, auth, erros, logging).
- Jobs assincronos isolados no worker com filas por tipo de evento.

**Data Boundaries:**
- `workspace_id` como particao logica obrigatoria nas entidades de dominio.
- Acesso a dados mediado por camadas de servico/repositorio.
- Cache e filas em Redis separados por namespace de responsabilidade.

### Requirements to Structure Mapping

**Feature/Epic Mapping:**
- IAM e permissao -> `blackbeans-api/apps/iam`, `.../governance`, `blackbeans-web/src/features/iam`
- Clientes/estrutura/projetos -> `.../clients`, `.../portfolios`, `.../projects`
- Operacao diaria (boards/groups/tasks/time) -> `.../boards`, `.../tasks`, `.../time_tracking`
- Auditoria e logs -> `.../audit`, `blackbeans-web/src/domain-components/audit-timeline-panel`
- Notificacoes -> `.../notifications`, `blackbeans-web/src/features/notifications`

**Cross-Cutting Concerns:**
- Tenancy -> `blackbeans-api/common/tenancy`
- Error contract -> `blackbeans-api/common/exceptions` + `blackbeans-web/src/services`
- Correlation/logging -> `blackbeans-api/common/logging`
- Components de decisao operacional -> `blackbeans-web/src/domain-components`

### Integration Points

**Internal Communication:**
- Frontend -> API REST versionada.
- API -> Postgres para persistencia principal.
- API -> Redis/Celery para eventos e notificacoes assincronas.
- Worker -> API domains para processamento de eventos operacionais.

**External Integrations:**
- Provedor de email para notificacoes.
- Futuras integracoes de relatorio/comunicacao via camada de `apps/notifications` e `apps/metrics`.

**Data Flow:**
- Acoes do usuario no frontend -> API valida auth/RBAC/tenancy -> grava no Postgres -> publica evento assincrono quando aplicavel -> worker processa -> notifica/atualiza.

### File Organization Patterns

**Configuration Files:**
- Ambiente por arquivo dedicado (`dev/staging/prod`) com heranca de `base`.
- Templates `.env.example` por servico no `infra/env`.

**Source Organization:**
- Backend organizado por dominio + camada comum transversal.
- Frontend em camadas (`design-system` -> `domain-components` -> `features`).

**Test Organization:**
- Backend: `unit`, `integration`, `contracts`.
- Frontend: `unit`, `integration`, `e2e`.
- Fluxos criticos com testes cobrindo auth, tenancy, permissao e auditoria.

**Asset Organization:**
- Assets frontend em `blackbeans-web/public/assets`.
- Artefatos de infraestrutura (nginx, scripts, compose) em `infra/`.

### Development Workflow Integration

**Development Server Structure:**
- Containers separados para frontend, backend, worker, redis e postgres em ambiente de desenvolvimento.
- Hot reload por servico, mantendo isolamento de responsabilidades.

**Build Process Structure:**
- Pipelines independentes para API e Web.
- Build de imagens versionadas por servico para deploy controlado.

**Deployment Structure:**
- VPS com compose por ambiente.
- Reverse proxy roteando para frontend e backend.
- Scripts de migracao e backup como parte do fluxo de release.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
As decisoes de stack, seguranca, dados, comunicacao e infraestrutura sao compativeis entre si. O conjunto Django/DRF + Next.js + PostgreSQL + Celery/Redis + Docker/VPS forma uma base coerente para o escopo definido.

**Pattern Consistency:**
Os padroes de naming, formato de API, eventos, logs e tratamento de erros suportam diretamente as decisoes arquiteturais e reduzem risco de divergencia entre agentes de implementacao.

**Structure Alignment:**
A estrutura fisica do projeto reflete os dominios do produto, os limites de responsabilidade e os pontos de integracao definidos na arquitetura.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
As capacidades centrais de operacao, governanca, notificacao e rastreabilidade estao mapeadas para modulos e fronteiras tecnicas claras.

**Functional Requirements Coverage:**
As categorias funcionais do PRD possuem suporte arquitetural explicito (IAM, clientes, estrutura, projetos, boards, tarefas, tempo, permissoes, logs, API e metricas).

**Non-Functional Requirements Coverage:**
Performance, seguranca, escalabilidade inicial, acessibilidade (AA) e observabilidade foram contempladas por decisoes e padroes concretos.

### Implementation Readiness Validation ✅

**Decision Completeness:**
As decisoes criticas estao documentadas com racional, impacto e direcao de implementacao.

**Structure Completeness:**
A arvore de projeto esta detalhada com separacao de backend/frontend/infra/testes e pontos de acoplamento controlados.

**Pattern Completeness:**
Padroes essenciais para consistencia entre agentes estao definidos (naming, estrutura, formato, comunicacao e processo).

### Gap Analysis Results

**Critical Gaps:** nenhum gap critico identificado para inicio de implementacao.

**Important Gaps:**
- Detalhamento futuro de politicas de retenção de auditoria e observabilidade em longo prazo.
- Definicao futura de thresholds operacionais para autoscaling e alertas avancados.

**Nice-to-Have Gaps:**
- Evolucao de event bus dedicado quando escala justificar.
- Fortalecimento de feature flags e estrategia de rollout gradual por tenant.

### Validation Issues Addressed

- Confirmada separacao de frontend e backend em containers distintos.
- Confirmado modelo tenant-aware com `workspace_id` como regra transversal.
- Confirmado contrato de API padrao para sucesso/erro com `correlation_id`.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**

- [x] Critical decisions documented
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance and security considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high

**Key Strengths:**
- Coerencia entre dominio de negocio e estrutura tecnica.
- Governanca forte (RBAC + auditoria + contratos padronizados).
- Base de escalabilidade progressiva sem excesso de complexidade inicial.

**Areas for Future Enhancement:**
- Event bus dedicado para cenarios de maior volume.
- Estrategias avancadas de observabilidade e capacidade preditiva.

### Implementation Handoff

**AI Agent Guidelines:**

- Seguir rigorosamente as decisoes arquiteturais e padroes definidos.
- Respeitar fronteiras de modulo e contratos de API/evento.
- Preservar consistencia de naming/formatos em toda entrega.
- Tratar `workspace_id` e `correlation_id` como campos obrigatorios nos fluxos criticos.

**First Implementation Priority:**
Inicializar os starters selecionados (`cookiecutter-django` e `create-next-app`) e subir a stack Docker base (api, web, worker, redis, postgres, proxy).

## Workflow Completion

Arquitetura concluida com sucesso para o `blackbeans-system`.

Documento final:
- `/_bmad-output/planning-artifacts/architecture.md`

Este documento passa a ser a fonte oficial para:
- decisoes tecnicas centrais,
- padroes de implementacao entre agentes,
- limites de estrutura e integracao,
- direcao de handoff para fase de implementacao.
