# Story 2.7: Calculo e exibicao de progresso e risco de projeto

Status: done

## Story

As a Gestor,  
I want visualizar indicadores de progresso e risco do projeto,  
so that eu antecipe desvios e priorize acoes corretivas.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`GET /projects/{id}/metrics`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de metricas de projeto implementado com retorno de `progress_percent`, `risk_level` e `status`.
- Regra de risco considera status `at_risk` e prazo vencido/proximo.
- Teste de integracao: `test_story_2_7_project_metrics`.

### Review Findings

- [x] [Review][Approve] Endpoint de metricas retorna progresso e risco em contrato simples e estável.
- [x] [Review][Approve] Regras de risco cobrem status em risco e prazo vencido/proximo.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
- 2026-04-20: reexecucao estrita BMAD confirmada com teste dedicado da story.
