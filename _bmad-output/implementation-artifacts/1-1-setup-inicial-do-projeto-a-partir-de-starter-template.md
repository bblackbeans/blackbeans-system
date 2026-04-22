# Story 1.1: Setup inicial do projeto a partir de starter template

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Time de desenvolvimento,  
I want inicializar backend e frontend a partir dos starters arquiteturais aprovados, com stack Docker base funcional,  
so that as historias funcionais do produto sejam implementadas sobre uma fundacao padronizada e reproduzivel.

## Acceptance Criteria

1. **Given** o repositorio de trabalho do projeto  
   **When** o time inicializar o backend com `cookiecutter-django` e o frontend com `create-next-app` conforme decisao de arquitetura  
   **Then** ambos os projetos base devem ser gerados com estrutura minima esperada e versionados no repositorio  
   **And** dependencias iniciais devem instalar com sucesso em ambiente de desenvolvimento.
2. **Given** a stack definida em arquitetura (`api`, `web`, `worker`, `redis`, `postgres`, `proxy`)  
   **When** o time subir os servicos com `docker compose` do ambiente de desenvolvimento  
   **Then** os containers devem iniciar sem erro bloqueante  
   **And** API e web devem ficar acessiveis internamente para execucao das historias seguintes.
3. **Given** a necessidade de consistencia para multiplos agentes de desenvolvimento  
   **When** o setup inicial for concluido  
   **Then** arquivos de configuracao de ambiente e instrucoes de bootstrap minimo devem estar presentes  
   **And** a base deve permitir evolucao incremental sem exigir criacao massiva de entidades antecipadas.

## Tasks / Subtasks

- [x] Criar baseline backend com `cookiecutter-django` (AC: 1)
  - [x] Inicializar `blackbeans-api` com template oficial e opcoes de DRF, PostgreSQL e Docker.
  - [x] Garantir estrutura de settings por ambiente (`dev`, `staging`, `prod`) e entrada de Celery.
  - [x] Validar instalacao de dependencias backend no ambiente local.
- [x] Criar baseline frontend com `create-next-app` (AC: 1)
  - [x] Inicializar `blackbeans-web` em Next.js com TypeScript e App Router.
  - [x] Preservar organizacao de codigo em `src/` e preparar base para Ant Design.
  - [x] Validar instalacao de dependencias frontend no ambiente local.
- [x] Montar stack de containers de desenvolvimento (AC: 2)
  - [x] Estruturar compose dev com servicos `api`, `web`, `worker`, `redis`, `postgres`, `proxy`.
  - [x] Confirmar health/startup sem erro bloqueante.
  - [x] Verificar conectividade interna entre frontend e backend.
- [x] Preparar arquivos de ambiente e bootstrap minimo (AC: 3)
  - [x] Criar exemplos de variaveis de ambiente para API, WEB e worker.
  - [x] Atualizar `README` com passo a passo de bootstrap e comandos essenciais.
  - [x] Documentar convencoes iniciais para evitar divergencia entre agentes.
- [x] Validar criterios de pronto da story (AC: 1, 2, 3)
  - [x] Registrar evidencias de inicializacao (comandos executados e resultados principais).
  - [x] Garantir que nao ha implementacao prematura de dominio fora do escopo da story.

## Dev Notes

- Esta story e fundacional: foco em **bootstrap tecnico** e padronizacao, sem implementar regras de negocio de IAM/tarefas neste momento.
- O setup deve seguir os limites arquiteturais de separacao front/back, API-first e stack Docker multi-servico.
- Manter aderencia estrita aos padroes de naming ja definidos para reduzir retrabalho nas proximas stories.

### Technical Requirements

- Backend com `cookiecutter-django` como starter aprovado; frontend com `create-next-app`.
- API versionada em `/api/v1/...` deve ser preservada desde a estrutura inicial.
- Infra de dev deve incluir containers separados: frontend, backend, worker, redis, postgres, proxy.
- Estrutura inicial deve preparar Celery + Redis (mesmo que sem fluxos de negocio completos ainda).
- Usar convencoes de nomenclatura:
  - backend/API: `snake_case`
  - componentes React: `PascalCase`
  - funcoes/variaveis frontend: `camelCase`
  - arquivos frontend: `kebab-case`

### Architecture Compliance

- Seguir a estrutura alvo com raiz contendo `blackbeans-api`, `blackbeans-web` e `infra`.
- Frontend deve consumir backend apenas via API (`/api/v1/...`), sem acesso direto ao banco.
- Preservar particionamento para evolucao multi-tenant futura (`workspace_id`) sem antecipar modelagem completa nesta story.
- Garantir base de observabilidade e operacao (estrutura para logs/health checks) sem expandir escopo funcional.

### Library / Framework Requirements

- `cookiecutter-django`: usar release estavel atual (referencia encontrada: serie `2026.04.x`) para evitar scaffold desatualizado.
- Django/DRF conforme defaults do starter selecionado (arquitetura aponta alinhamento com Django 6.x).
- `create-next-app@latest` com TypeScript e App Router.
- Ant Design permanece como base de UI para etapas seguintes; nesta story, apenas garantir ambiente pronto.

### File Structure Requirements

- Backend em `blackbeans-api/` com estrutura de `config/settings`, apps de dominio e testes por tipo.
- Frontend em `blackbeans-web/` com `src/app`, `design-system`, `domain-components`, `features`, `services`, `state`, `hooks`, `lib`, `types`.
- Infra em `infra/` com `docker-compose.dev.yml`, Dockerfiles (`api`, `web`, `worker`) e configuracao de proxy.
- Nao introduzir estruturas alternativas fora do desenho arquitetural aprovado.

### Testing Requirements

- Validar build/startup basico dos servicos principais via compose dev.
- Executar smoke checks de inicializacao:
  - API sobe sem erro bloqueante
  - WEB sobe sem erro bloqueante
  - Worker conecta em Redis sem falha critica
- Registrar no minimo comandos de verificacao no README/dev notes da entrega.
- Testes de dominio (unit/integration/contract) completos ficam para stories funcionais subsequentes.

### Project Structure Notes

- Esta story deve deixar a base pronta para a sequencia de implementacao definida na arquitetura: IAM/RBAC primeiro, depois dominio core e assicronia.
- Evitar criar entidades de negocio desnecessarias nesta etapa para manter entrega incremental e limpa.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` - Epic 1 / Story 1.1]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Selected Starter: cookiecutter-django]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Infrastructure & Deployment]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Complete Project Directory Structure]
- [Source: `_bmad-output/planning-artifacts/architecture.md` - Decision Impact Analysis / Implementation Sequence]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- `npx create-next-app@latest blackbeans-web --ts --app --src-dir --eslint --use-npm --yes`
- `.venv-tools/bin/cookiecutter https://github.com/cookiecutter/cookiecutter-django --no-input ...`
- `docker compose -f infra/docker-compose.dev.yml config`
- `docker compose -f infra/docker-compose.dev.yml up -d --build`
- `docker compose -f infra/docker-compose.dev.yml ps`
- `curl -I http://localhost:13000`
- `curl -I http://localhost:18000`
- `curl -I http://localhost:18080`
- `npm run lint` (em `blackbeans-web`)

### Completion Notes List

- Backend bootstrapado com `cookiecutter-django` e ajustado para padrao de diretoria `blackbeans-api`.
- Frontend bootstrapado com `create-next-app` (TypeScript + App Router) em `blackbeans-web`.
- Stack Docker de desenvolvimento criada em `infra/` com `api`, `web`, `worker`, `redis`, `postgres`, `proxy`.
- Dockerfiles de API/worker adaptados para runtime com `uv` e Python 3.14 (alinhado ao `pyproject.toml`).
- Arquivos de ambiente de exemplo criados e documentacao de bootstrap atualizada no `README.md`.
- Smoke checks executados com sucesso para web/api/proxy e `docker compose` valido.

### File List

- `_bmad-output/implementation-artifacts/1-1-setup-inicial-do-projeto-a-partir-de-starter-template.md`
- `blackbeans-api/**` (scaffold inicial gerado por cookiecutter-django)
- `blackbeans-web/**` (scaffold inicial gerado por create-next-app)
- `infra/docker-compose.dev.yml`
- `infra/docker/api.Dockerfile`
- `infra/docker/worker.Dockerfile`
- `infra/docker/web.Dockerfile`
- `infra/docker/nginx/default.conf`
- `infra/env/api.env.example`
- `infra/env/worker.env.example`
- `infra/env/web.env.example`
- `.dockerignore`
- `README.md`

## Change Log

- 2026-04-17: Implementacao completa da Story 1.1 (bootstrap backend/frontend, stack docker dev, env examples e validacoes de smoke test).
- 2026-04-17: Ajustes pos-review aplicados (README corrigido, hot reload em compose dev e migrations executadas com sucesso).
