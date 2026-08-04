# Gap Analysis - Backend x Front x RFs

## Escopo
- Backend: `blackbeans-api/blackbeans_api/api/*`
- Frontend: `blackbeans-web/src/components/app-shell.tsx`
- Requisitos: `Documento de Requisitos Funcionais (RFs) - Sistema de Gestão de Agência (tarefas_system).md` e `_bmad-output/planning-artifacts/prd.md`

## Matriz RF/FR x Endpoints x Cobertura Front

| RF/FR | Dominio | Endpoints principais | Cobertura no front | Status |
| --- | --- | --- | --- | --- |
| RF-PERM / FR1..FR8 | Governanca de permissoes | `/permissions/matrix`, `/permissions/conflicts/resolve-preview`, `/permissions/conflicts/resolve`, `/permissions/assignments`, `/permissions/bulk/preview`, `/permissions/bulk/apply` | Matriz e conflitos cobertos; assignments/bulk ausentes | Parcial |
| RF-TSK / FR21..FR33 | Tarefas e Kanban | `/tasks`, `/tasks/{id}`, `/tasks/{id}/status`, `/boards/{id}?view=kanban`, `/boards/{id}/groups` | Criacao/edicao/movimentacao/status cobertos | Completo |
| FR56 | Board timeline/list | `/boards/{id}?view=list|kanban|timeline` | Apenas `kanban` | Parcial |
| RF-TSK / FR34..FR39 | Tempo de tarefa | `/tasks/{id}/time/*`, `/tasks/{id}/time-summary`, `/time-logs`, `/time-logs/{id}` | Coberto no drawer + Admin/Ops | Completo |
| RF-TSK / FR55 | Dependencias, anexos, comentarios | `/tasks/{id}/dependencies`, `/tasks/{id}/attachments`, `/tasks/{id}/comments`, `/tasks/{id}/activity` | Coberto no detalhe da tarefa | Completo |
| RF-COL / FR9..FR12 | Colaboradores e vinculos | `/users/{id}/collaborator-links` (POST/DELETE), `/collaborators/*`, `/me/collaborator-profile` | Create/update/link coberto; unlink ausente | Parcial |
| RF-CLI / FR13..FR20 | Clientes e estrutura | `/clients`, `/clients/{id}`, `/clients/{id}/status-toggle`, `/workspaces`, `/portfolios`, `/projects`, `/boards` | CRUD principal coberto; detalhe cliente por fluxo dedicado ausente | Parcial |
| RF-NOT / FR40..FR45 | Notificacoes | `/notifications`, `/notifications/unread-count`, `/notifications/{id}/read`, `/notifications/deadline-scan` | Coberto | Completo |
| RF-LOG / FR46..FR50 | Auditoria | `/audit/dashboard`, `/audit/logs` | Coberto | Completo |
| RF-API / FR51..FR54 | API/health/stats | `/health`, `*/stats`, `/projects/{id}/metrics`, `/boards/{id}/progress` | Coberto | Completo |

## Gaps Priorizados
1. **P1** - Implementar governanca completa no front: assignments e bulk preview/apply.
2. **P1** - Implementar remocao de vinculo user-collaborator no Admin/Ops.
3. **P2** - Habilitar view de board `list` e `timeline` na aba de tarefas.
4. **P3** - Evoluir exploracao de `tasks` globais e detalhe dedicado de cliente por ID.

## Evidencias de Cobertura Front
- Governanca atual: `activeKey === "governance"` em `blackbeans-web/src/components/app-shell.tsx`
- Admin/Ops de usuarios e colaboradores: `activeKey === "admin-ops"` em `blackbeans-web/src/components/app-shell.tsx`
- Board Kanban atual: aba `key: "kanban"` em `blackbeans-web/src/components/app-shell.tsx`
- Proxy BFF: `blackbeans-web/src/app/api/v1/[...path]/route.ts`
