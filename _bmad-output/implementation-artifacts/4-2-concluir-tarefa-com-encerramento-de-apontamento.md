# Story 4.2: Concluir tarefa com encerramento de apontamento

Status: done

## Story

As a Colaborador,  
I want concluir tarefa encerrando o cronometro ativo,  
so that o fechamento da atividade fique consistente entre status e tempo registrado.

## Tasks / Subtasks

- [x] Create-story concluido.
- [x] Dev-story concluido (`POST /tasks/{id}/complete`).
- [x] Code-review concluido.

## Dev Agent Record

### Completion Notes List

- Endpoint de conclusao encerra sessao ativa em transacao atomica.
- Status da tarefa atualizado para `done` com registro de data/hora de conclusao.
- Regra de bloqueio por dependencia mantida no endpoint de conclusao.
- Resposta retorna tarefa e time log finalizado para consistencia de UI.
- Teste de integracao cobrindo encerramento de apontamento ao concluir tarefa.

### Review Findings

- [x] [Review][Patch] Evitar concluir tarefa sem sessao ativa do usuario executor.
- [x] [Review][Approve] Conclusao preserva consistencia entre tempo e status.

### Change Log

- 2026-04-20: ciclo BMAD completo (create/dev/review).
