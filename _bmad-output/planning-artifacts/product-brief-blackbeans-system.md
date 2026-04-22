---
title: "Product Brief: blackbeans-system"
status: "complete"
created: "2026-04-14T10:25:00-03:00"
updated: "2026-04-14T10:31:00-03:00"
inputs:
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-14-08-39.md"
  - "Documento de Requisitos Funcionais (RFs) - Sistema de Gestão de Agência (tarefas_system).md"
---

# Product Brief - Blackbeans System

## 1) Resumo Executivo

O `blackbeans-system` e um sistema de gestao operacional para agencias brasileiras, inspirado em plataformas de Work Management como Monday.com, mas desenhado para o contexto real de operacao de agencias: relacao com clientes, controle de projetos em hierarquia completa, governanca por permissao granular e rastreabilidade por auditoria nativa.

O objetivo da V1 e lancar um produto funcionalmente completo em relacao aos RFs mapeados, com foco em execucao confiavel: testes de API nos modulos core, processamento assincrono para notificacoes e trilha de auditoria em eventos criticos (CRUD, autenticacao, permissoes e tempo de tarefa).

## 2) Problema e Oportunidade

Agencias que operam multiplos clientes e projetos sofrem com fragmentacao de ferramentas, baixa visibilidade operacional e pouca confianca em dados de produtividade. Solucoes generalistas costumam exigir adaptacoes extensas para refletir a hierarquia real de operacao (Workspace > Portfolio > Project > Board > Group > Task), o que aumenta friccao de adocao e reduz consistencia de processo.

Ha oportunidade clara para um produto verticalizado para agencias BR, com:
- controle de horas e esforco integrado ao fluxo de tarefa;
- auditoria nativa para governanca e responsabilidade operacional;
- permissoes alinhadas a hierarquia real de trabalho;
- visao integrada de cliente, entrega e produtividade.

## 3) Publico-Alvo e Usuario Primario

**Usuario primario na V1:** Coordenador de Operacoes.

**Perfis secundarios relevantes:**
- Gestor de contas/projetos (acompanhamento de prazos e risco);
- Liderancas de area (alocacao, priorizacao e controle de acesso);
- Colaboradores (execucao de tarefas, apontamento de tempo e notificacoes).

## 4) Proposta de Valor e Diferenciacao

**Proposta central:** "Gerencie a operacao completa da sua agencia em um unico sistema, com controle de horas, auditoria nativa e permissoes por hierarquia real."

**Diferenciais da V1:**
- foco em agencia BR (linguagem, fluxo operacional e governanca);
- controle de tempo nativo no ciclo da tarefa (start/pause/resume/concluir + logs);
- auditoria estruturada para operacao e seguranca;
- modelo de permissao granular por objeto organizacional.

No contexto competitivo, Monday.com e forte em execucao e visao de plataforma, o que reforca a necessidade de posicionamento vertical com profundidade operacional para agencia como principal estrategia de diferenciacao.

## 5) Escopo da V1 (Cobertura Completa de RFs)

### Modulos minimos da V1

1. **Plataforma Base e Seguranca**
   - autenticacao, autorizacao, usuario/perfil e `/health/`.
2. **Colaboradores e Departamentos**
   - cadastro, vinculos e alocacao em workspaces.
3. **Clientes**
   - CRUD completo, status, busca/filtros, detalhes com estatisticas.
4. **Estrutura Organizacional**
   - workspaces, portfolios e projetos com progresso e risco.
5. **Execucao Operacional**
   - boards, grupos e tarefas com visualizacoes e progresso.
6. **Tempo e Produtividade**
   - cronometro nativo, logs de sessao, "minhas tarefas".
7. **Permissoes Granulares**
   - por workspace/portfolio/projeto/quadro, com operacao em lote.
8. **Notificacoes Assincronas**
   - eventos de atribuicao, conclusao, atraso e prazo proximo.
9. **Logs e Auditoria**
   - eventos criticos de negocio e autenticacao.
10. **API REST e Metricas**
    - CRUDs, acoes especificas e endpoints de estatistica.
11. **Qualidade e Confiabilidade**
    - testes API dos modulos core e transacoes atomicas.

### Fora de escopo explicito da V1

- aplicativo mobile nativo;
- funcionalidades avancadas de IA.

## 6) Metricas de Sucesso (Primeiros 90 dias)

- **Tarefas no prazo:** aumento da taxa de tarefas concluidas dentro do prazo planejado.
- **Reducao de retrabalho:** queda no volume de reabertura/ajuste recorrente de tarefas.
- **Tempo medio por tarefa:** melhoria da previsibilidade e reducao de variacao em tarefas similares.
- **Adocao ativa semanal:** crescimento de usuarios ativos semanais por papel-chave operacional.

## 7) Estrategia de Entrega e Risco

**Sequencia recomendada de entrega:**
1. Fundacao tecnica e seguranca;
2. Nucleo de dominio (clientes + estrutura organizacional);
3. Operacao diaria (board/task/tempo);
4. Governanca (permissoes + auditoria) e notificacoes;
5. Consolidacao de API, metricas, hardening e go-live.

### Criterios de aceite por fase

- **Fase 1 - Fundacao tecnica e seguranca**
  - autenticacao/autorizacao operacional em ambiente de homologacao;
  - endpoint `/health/` e monitoramento basico ativo;
  - baseline de testes API executando no pipeline.
- **Fase 2 - Nucleo de dominio**
  - CRUD completo de clientes, workspaces, portfolios e projetos;
  - filtros e consultas principais funcionando para operacao diaria;
  - consistencia de dados entre niveis da hierarquia validada.
- **Fase 3 - Operacao diaria**
  - board/grupo/tarefa operacionais com atualizacao de status;
  - controle de tempo completo (start/pause/resume/concluir) e logs;
  - "minhas tarefas" atendendo filtros operacionais essenciais.
- **Fase 4 - Governanca e notificacoes**
  - matriz de permissao aplicada por nivel hierarquico;
  - auditoria cobrindo CRUD, autenticacao, permissoes e tempo;
  - notificacoes assincronas de eventos criticos ativas.
- **Fase 5 - Fechamento V1**
  - endpoints de metricas e relatorios de operacao disponiveis;
  - testes API dos modulos core aprovados;
  - checklist de go-live concluido com zero bloqueadores criticos.

**Riscos principais e mitigacao:**
- **Escopo alto para V1:** mitigar com sequenciamento por dependencias e criterios de aceite por modulo.
- **Complexidade de permissao/auditoria:** mitigar com modelo de dominio consistente e testes de regressao de autorizacao.
- **Adocao operacional:** mitigar com UX objetiva para coordenador de operacoes e indicadores acionaveis.

### Plano de pilotos iniciais (validacao de adocao)

- **Perfil de piloto:** 2 a 3 agencias BR de pequeno/medio porte com operacao ativa de projetos e times multifuncionais.
- **Janela de validacao:** 6 a 8 semanas apos conclusao da Fase 3.
- **Escopo do piloto:** modulo de clientes + estrutura organizacional + operacao diaria + controles de governanca minimos.
- **Ritmo de acompanhamento:** ritual semanal de feedback com coordenador de operacoes e lideranca.
- **Criterios de sucesso do piloto:**
  - melhoria em tarefas no prazo;
  - reducao de retrabalho percebido;
  - tendencia de queda no tempo medio por tarefa;
  - crescimento de adocao ativa semanal por perfil-chave.
- **Plano de mitigacao de adocao:**
  - onboarding guiado por papel (coordenador, gestor, colaborador);
  - templates iniciais de boards e fluxos padrao para acelerar uso;
  - backlog curto de ajustes de UX orientado por feedback semanal.

## 8) Decisoes-Chave para PRD

1. Definir criterios de aceite por bloco funcional (RFs agrupados por modulo).
2. Formalizar modelo de permissao (matriz papel x objeto x acao).
3. Detalhar eventos obrigatorios de auditoria e niveis de severidade.
4. Estabelecer definicao padrao de metricas operacionais (prazo, retrabalho, tempo medio, adocao).

## 9) Proximo Passo Recomendado

Usar este Product Brief como insumo direto para `bmad-create-prd`, com foco em:
- rastreabilidade RF -> historias;
- requisitos nao funcionais como criterios de arquitetura e teste;
- plano de validacao por metrica de negocio da V1.
