# Go-Live Checklist

Status: draft
Projeto: blackbeans-system

## 1. Infra e Operação

- [ ] Ambiente de produção provisionado (API, Web, Worker, Redis, Postgres, Proxy).
- [ ] Endpoint `GET /api/v1/health` integrado ao monitoramento.
- [ ] Alertas de indisponibilidade configurados (API, DB, filas, worker).
- [ ] Rotação e retenção de logs definidas.
- [ ] Backup e restore de banco testados.

## 2. Banco e Migrações

- [ ] Plano de execução de migrações aprovado.
- [ ] Migrações aplicadas em ambiente de homologação.
- [ ] Teste de rollback validado para cenário crítico.
- [ ] Verificação de integridade pós-migração executada.

## 3. Segurança e Acesso

- [ ] Secrets de produção fora do repositório e com rotação definida.
- [ ] Configurações JWT/refresh/2FA revisadas para produção.
- [ ] RBAC validado por escopo (`workspace`, `portfolio`, `project`, `board`).
- [ ] Testes de isolamento de tenant executados.
- [ ] Auditoria (`AuditLog`) validada para operações críticas.

## 4. Qualidade e Testes

- [ ] Suite de integração executada sem falhas.
- [ ] Smoke tests dos fluxos críticos executados.
- [ ] Testes E2E de jornada principal aprovados.
- [ ] Sem blockers abertos em bugs críticos/altos.
- [ ] Warnings operacionais revisados e aceitos/tratados.

## 5. Produto e Homologação

- [ ] Critérios de aceite por epic confirmados com negócio.
- [ ] Frontend validado consumindo contratos finais da API.
- [ ] Stakeholders chave aprovaram a versão para release.

## 6. Release e Pós-Release

- [ ] Plano de rollout definido (janela, responsáveis, passos).
- [ ] Plano de rollback definido e comunicado.
- [ ] Notas de versão publicadas.
- [ ] Monitoramento reforçado no pós-release.
- [ ] Checklist de observação pós-go-live concluído.

## 7. Critério de Go/No-Go

- [ ] Todos os itens obrigatórios concluídos.
- [ ] Riscos residuais documentados e aceitos.
- [ ] Decisão formal registrada: **GO** ou **NO-GO**.
