# Documento de Requisitos Funcionais (RFs) \- Sistema de Gestão de Agência (tarefas\_system)

Este documento detalha os Requisitos Funcionais (RFs) extraídos a partir da análise do código-fonte do projeto `tarefas_system`, um sistema de gestão de agência inspirado no Monday.com. O sistema possui uma hierarquia estruturada (Workspace → Portfolio → Project → Board → Group → Task) e funcionalidades avançadas de controle de tempo, permissões e notificações.

## 1\. Gestão de Clientes (Client)

A gestão de clientes permite o cadastro e acompanhamento das empresas atendidas pela agência. O sistema deve permitir o cadastro de novos clientes com informações como nome, CNPJ, email, telefone, endereço completo e status (ativo/inativo). Além disso, deve listar todos os clientes cadastrados, permitindo filtragem por status e busca por nome, CNPJ ou email.

O sistema deve exibir os detalhes de um cliente específico, incluindo estatísticas como total de portfólios, projetos e tarefas). Também deve permitir a edição das informações de um cliente existente, a exclusão de um cliente (registrando a ação nos logs do sistema) e a alternância rápida de seu status (ativo/inativo) via API ou interface.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-CLI-01 | Cadastrar Cliente | Permitir o cadastro de novos clientes com informações detalhadas e status. |
| RF-CLI-02 | Listar Clientes | Listar clientes com opções de filtragem e busca. |
| RF-CLI-03 | Visualizar Detalhes | Exibir detalhes, estatísticas e associações recentes de um cliente. |
| RF-CLI-04 | Editar Cliente | Permitir a edição das informações de um cliente. |
| RF-CLI-05 | Excluir Cliente | Permitir a exclusão de um cliente, com registro em log. |
| RF-CLI-06 | Alternar Status | Permitir ativar ou inativar um cliente rapidamente. |

## 2\. Gestão de Workspaces (Áreas de Trabalho)

O Workspace é o nível mais alto da hierarquia organizacional, geralmente associado a um cliente ou departamento. O sistema deve permitir a criação de workspaces com nome, descrição, cor de identificação, status e associação opcional a um cliente.

O sistema deve listar os workspaces disponíveis, exibindo informações básicas e estatísticas (total de portfólios, projetos e boards). Deve também exibir os detalhes de um workspace, incluindo os portfólios e projetos contidos nele, além de permitir a edição e exclusão de workspaces.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-WS-01 | Cadastrar Workspace | Permitir a criação de workspaces com informações básicas e associação a cliente. |
| RF-WS-02 | Listar Workspaces | Listar workspaces com informações e estatísticas. |
| RF-WS-03 | Visualizar Detalhes | Exibir detalhes de um workspace e seus elementos contidos. |
| RF-WS-04 | Editar Workspace | Permitir a edição das informações de um workspace. |
| RF-WS-05 | Excluir Workspace | Permitir a exclusão de um workspace. |

## 3\. Gestão de Portfólios

O Portfólio serve para agrupar projetos dentro de um Workspace, funcionando como uma “pasta”. O sistema deve permitir a criação de portfólios vinculados a um workspace, com nome, descrição, cor e status.

O sistema deve listar os portfólios, permitindo visualização de seus projetos associados. Deve exibir os detalhes do portfólio, incluindo métricas de progresso, total de projetos e tarefas concluídas, além de permitir a edição e exclusão de portfólios.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-PORT-01 | Cadastrar Portfólio | Permitir a criação de portfólios vinculados a um workspace. |
| RF-PORT-02 | Listar Portfólios | Listar portfólios e seus projetos associados. |
| RF-PORT-03 | Visualizar Detalhes | Exibir detalhes e métricas de progresso de um portfólio. |
| RF-PORT-04 | Editar Portfólio | Permitir a edição das informações de um portfólio. |
| RF-PORT-05 | Excluir Portfólio | Permitir a exclusão de um portfólio. |

## 4\. Gestão de Projetos (Project)

O Projeto é a unidade principal de entrega, contendo cronograma, orçamento e status. O sistema deve permitir a criação de projetos vinculados a um cliente e opcionalmente a um portfólio, definindo nome, descrição, cronograma (início e fim previstos), status, prioridade, orçamento e estimativa de esforço.

O sistema deve listar os projetos, exibindo seu status (dentro do prazo, em risco, atrasado, etc.), prioridade e progresso percentual. Deve exibir os detalhes do projeto, incluindo seus quadros (boards), estatísticas de tarefas e indicadores de atraso. Também deve permitir a edição das informações do projeto (incluindo atualização de datas reais de início e fim), a exclusão de projetos e a atualização rápida de seu status.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-PROJ-01 | Cadastrar Projeto | Permitir a criação de projetos com cronograma, orçamento e status. |
| RF-PROJ-02 | Listar Projetos | Listar projetos com status, prioridade e progresso. |
| RF-PROJ-03 | Visualizar Detalhes | Exibir detalhes, quadros e estatísticas de um projeto. |
| RF-PROJ-04 | Editar Projeto | Permitir a edição das informações e datas reais de um projeto. |
| RF-PROJ-05 | Excluir Projeto | Permitir a exclusão de um projeto. |
| RF-PROJ-06 | Atualizar Status | Permitir a atualização rápida do status de um projeto. |

## 5\. Gestão de Quadros (Board) e Grupos (Group)

Os Quadros (Boards) organizam as tarefas de um projeto, e os Grupos categorizam as tarefas dentro de um quadro. O sistema deve permitir a criação de quadros vinculados a um projeto, com nome, descrição e cor.

O sistema deve exibir o quadro em formato lista, mostrando os grupos e suas respectivas tarefas. Deve permitir gerenciar grupos no quadro (adicionar, editar, excluir), definindo nome, tipo (fluxo de trabalho), cor, ordem e limite opcional de tarefas (WIP limit). Também deve permitir a reordenação dos grupos e calcular/exibir o progresso do quadro com base nas tarefas concluídas. O sistema deve permitir que, além da visualização em lista, seja possível a visualização em Kanban ou cronograma de datas.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-BRD-01 | Cadastrar Quadro | Permitir a criação de quadros vinculados a um projeto. |
| RF-BRD-02 | Visualizar Quadro | Exibir o quadro em formato Kanban ou lista com grupos e tarefas. |
| RF-BRD-03 | Gerenciar Grupos | Permitir adicionar, editar e excluir grupos com propriedades específicas. |
| RF-BRD-04 | Reordenar Grupos | Permitir a reordenação dos grupos dentro de um quadro. |
| RF-BRD-05 | Estatísticas do Quadro | Calcular e exibir o progresso do quadro baseado em tarefas concluídas. |

## 6\. Gestão de Tarefas (Task) e Controle de Tempo

A Tarefa é a unidade básica de trabalho, possuindo recursos avançados de controle de tempo e dependências. O sistema deve permitir a criação de tarefas vinculadas a um grupo, definindo nome, descrição, status, prioridade, cronograma, duração, esforço previsto e campo para comentários. Deve permitir a atribuição de um colaborador como responsável e o gerenciamento de dependências (recalculando datas automaticamente).

O sistema deve possuir um cronômetro integrado, permitindo iniciar, pausar e retomar o trabalho na tarefa, registrando logs de sessão com a duração. Deve permitir concluir a tarefa (parando o cronômetro e registrando a data), gerenciar os logs de sessão (edição/exclusão manual), visualizar tarefas atribuídas ao usuário logado e atualizar o status da tarefa.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-TSK-01 | Cadastrar Tarefa | Permitir a criação de tarefas com propriedades detalhadas. |
| RF-TSK-02 | Atribuir Responsável | Permitir a atribuição de um colaborador à tarefa. |
| RF-TSK-03 | Gerenciar Dependências | Permitir definir dependências e recalcular datas automaticamente. |
| RF-TSK-04 | Iniciar Trabalho | Permitir iniciar o cronômetro da tarefa. |
| RF-TSK-05 | Pausar Trabalho | Permitir pausar o cronômetro e salvar log de sessão. |
| RF-TSK-06 | Retomar Trabalho | Permitir retomar o cronômetro de uma tarefa pausada. |
| RF-TSK-07 | Concluir Tarefa | Permitir concluir a tarefa, parando o cronômetro e registrando dados. |
| RF-TSK-08 | Gerenciar Logs | Permitir a edição ou exclusão manual de logs de sessão. |
| RF-TSK-09 | Visualizar Minhas Tarefas | Fornecer visão específica das tarefas do usuário logado com filtros. |
| RF-TSK-10 | Atualizar Status | Permitir a mudança de status da tarefa. |

## 7\. Gestão de Colaboradores (Collaborator) e Departamentos

Gerencia os usuários do sistema e suas alocações. O sistema deve permitir o cadastro de colaboradores, vinculando-os a um usuário do sistema (User), com informações pessoais e profissionais. É importante que se possa determinar nome, email, foto de perfil, cargo e hora homem de cada colaborador.

O sistema deve permitir associar o colaborador a um Departamento (ou Área), definir a quais workspaces ele tem acesso e fornecer uma página de perfil para o colaborador visualizar suas informações. 

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-COL-01 | Cadastrar Colaborador | Permitir o cadastro de colaboradores vinculados a usuários do sistema. |
| RF-COL-02 | Gerenciar Departamentos | Permitir associar colaboradores a departamentos ou áreas. |
| RF-COL-03 | Alocação em Workspaces | Permitir definir o acesso de colaboradores a workspaces específicos. |
| RF-COL-04 | Perfil do Usuário | Fornecer página de perfil para o colaborador logado. |

## 8\. Sistema de Permissões (Permissions)

Controle granular de acesso aos diferentes níveis da hierarquia. O sistema deve permitir configurar permissões de visibilidade e acesso específicas para workspaces, portfólios, projetos e quadros, aplicáveis a colaboradores individuais ou áreas inteiras.

O sistema deve fornecer uma interface para administradores aplicarem permissões em lote para múltiplos objetos simultaneamente e um dashboard centralizado para visualização e gerenciamento de todas as permissões.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-PERM-01 | Permissões de Workspace | Configurar acesso a workspaces para colaboradores ou áreas. |
| RF-PERM-02 | Permissões de Portfólio | Configurar visibilidade específica para portfólios. |
| RF-PERM-03 | Permissões de Projeto | Configurar visibilidade específica para projetos. |
| RF-PERM-04 | Permissões de Quadro | Configurar visibilidade específica para quadros. |
| RF-PERM-05 | Gerenciamento em Lote | Permitir a aplicação de permissões em lote para múltiplos objetos. |
| RF-PERM-06 | Dashboard de Permissões | Fornecer painel centralizado para gestão de permissões. |

## 9\. Sistema de Notificações (Notification)

Alertas automáticos baseados em eventos do sistema, processados de forma assíncrona via Celery. O sistema deve gerar notificações (via sistema e email) para eventos como: novo responsável designado, tarefa concluída, tarefa atrasada e prazo próximo.

O sistema deve fornecer uma central de notificações para o usuário visualizar, marcar como lidas e acompanhar o contador de alertas não lidos.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-NOT-01 | Novo Responsável | Notificar colaborador quando designado para uma tarefa. |
| RF-NOT-02 | Tarefa Concluída | Gerar notificação quando uma tarefa for concluída. |
| RF-NOT-03 | Tarefa Atrasada | Alertar responsáveis sobre tarefas atrasadas (via Celery). |
| RF-NOT-04 | Prazo Próximo | Alertar responsáveis sobre tarefas com prazo próximo (via Celery). |
| RF-NOT-05 | Central de Notificações | Fornecer interface para visualização e gestão de notificações. |

## 10\. Logs do Sistema (System Logs) e Auditoria

Rastreamento de ações para fins de auditoria e segurança. O sistema deve registrar automaticamente ações importantes (criação, atualização, exclusão, alterações de permissão) e eventos de autenticação (login/logout), armazenando detalhes do usuário, timestamp, IP e severidade.

O sistema deve fornecer um dashboard exclusivo para superusuários visualizarem estatísticas de logs e uma interface para listagem e filtragem detalhada dos registros.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-LOG-01 | Registro de Ações | Registrar ações importantes no sistema com detalhes completos. |
| RF-LOG-02 | Registro de Autenticação | Registrar eventos de login (sucesso/falha) e logout. |
| RF-LOG-03 | Dashboard de Logs | Fornecer painel com estatísticas de logs para superusuários. |
| RF-LOG-04 | Listagem e Filtro | Permitir listagem e filtragem detalhada de logs. |

## 11\. Requisitos de API (REST)

O sistema expõe suas funcionalidades via API REST (Django REST Framework). A API deve fornecer endpoints CRUD completos para todas as entidades principais, endpoints para ações específicas (controle de tempo, status, dependências) e endpoints para recuperação de estatísticas e métricas.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RF-API-01 | Endpoints CRUD | Fornecer endpoints para operações básicas em todas as entidades. |
| RF-API-02 | Ações Específicas | Expor endpoints para controle de tempo, status e dependências. |
| RF-API-03 | Estatísticas | Fornecer endpoints para métricas de projetos, portfólios e workspaces. |

## 12\. Requisitos Não Funcionais (RNFs) Identificados

Além dos requisitos funcionais, foram identificados requisitos não funcionais cruciais para o funcionamento do sistema. O processamento de emails e verificações periódicas deve ser assíncrono (Celery/Redis). O controle de acesso administrativo deve ser restrito a superusuários. A interface deve ser responsiva (Bootstrap 5). O banco de dados deve suportar transações atômicas para operações críticas, e o sistema deve expor um endpoint de *health check* para monitoramento.

| ID | Requisito | Descrição |
| :---- | :---- | :---- |
| RNF-01 | Processamento Assíncrono | Utilizar Celery e Redis para tarefas em segundo plano. |
| RNF-02 | Controle de Acesso | Restringir funcionalidades administrativas a superusuários. |
| RNF-03 | Interface Responsiva | Utilizar Bootstrap 5 para garantir responsividade. |
| RNF-04 | Banco de Dados | Utilizar transações atômicas em operações críticas. |
| RNF-05 | Health Check | Expor endpoint `/health/` para monitoramento do sistema. |

