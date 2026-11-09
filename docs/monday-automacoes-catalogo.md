# Catálogo de automações do Monday x Black Beans

Fontes (ajuda oficial do Monday, lidas em 2026-11):
- AI Workflows: features and capabilities — https://support.monday.com/hc/en-us/articles/20598895919122-AI-Workflows-features-and-capabilities (lista oficial de gatilhos, condições e ações do construtor novo)
- Alerts and Reminders with Automations — https://support.monday.com/hc/en-us/articles/360000227739-Alerts-and-Reminders-with-Automations
- Crie sua automação personalizada — https://support.monday.com/hc/pt/articles/360012254440
- Comece a usar as automações da monday — https://support.monday.com/hc/pt/articles/360001222900
- Automações entre quadros — https://support.monday.com/hc/en-us/articles/360011393900-Cross-board-automations (resumo via busca, não lido na íntegra)

Legenda: ✔ já temos · ◐ parcial · ✖ não temos · ➖ não se aplica ao nosso modelo (sem colunas personalizadas)

## Gatilhos
| Monday | Nós |
|---|---|
| Status muda para algo | ✔ task.status_changed |
| Status muda de algo para algo | ✔ (campos De/Para) |
| Status de subitem muda | ✔ gatilho de status + condição "Tarefa pai não está vazia" |
| Item criado | ✔ task.created |
| Subitem criado | ✔ idem |
| Chega uma data | ◐ task.due_soon / task.overdue (só prazo final) |
| Formulário enviado | ✖ |
| Coluna muda | ◐ responsável e prioridade; faltam os demais campos |
| A cada período | ✔ schedule.recurring |
| Botão clicado | ✔ task.button |
| Item muda de grupo | ✔ task.moved_to_group |
| Item muda de quadro | ✔ task.moved_to_board |
| Usuário entra na conta / quadro criado | ✖ |
| Atualização (comentário) criada | ✔ task.comment_added |
| Nome do item muda | ✔ task.title_changed |
| Item arquivado | ✔ task.archived |
| Item excluído | ✖ (a tarefa deixa de existir) |

## Condições ("se")
| Monday | Nós |
|---|---|
| Status é algo | ✔ |
| Pessoa é alguém | ✔ |
| Item está neste grupo | ✔ |
| Coluna vazia | ✔ |
| Número atende condição | ✔ (pontos de esforço) |
| Todos os subitens com status X | ✖ |
| Dropdown | ➖ |

## Ações
| Monday | Nós |
|---|---|
| Alterar status | ✔ |
| Adicionar / substituir responsável | ◐ set_assignee (substitui) |
| Notificar alguém | ✔ |
| Criar update (comentário) | ✔ |
| Criar subitem | ✔ |
| Criar item (em outro quadro) | ✔ create_task |
| Mover item para quadro | ✔ move_to_board (leva as subtarefas) |
| Duplicar item | ✔ duplicate_task |
| Definir data / empurrar data | ✔ set_due_date + push_date |
| Definir número | ✔ set_effort (pontos de esforço) |
| Limpar valor de coluna | ◐ só prazo |
| Arquivar / excluir item | ✔ |
| Iniciar / parar controle de tempo | ✖ |
| Inscrever usuário no quadro | ✖ |
| Criar grupo / duplicar grupo | ✖ |
| Criar / duplicar quadro | ✖ |
| E-mail (Gmail/Outlook), Slack | ✖ (integrações) |
| Criar Doc | ✖ |

## Blocos do construtor novo
| Monday | Nós |
|---|---|
| Várias condições e várias ações | ✔ |
| Se uma ação falha, as seguintes continuam | ✔ (corrigido) |
| Importância (só etiqueta) | ✔ |
| Duplicar automação | ✔ |
| Salvar como template | ✖ |
| Atraso (delay) entre passos | ✖ |
| Loop (repetir em subitens) | ✖ |
| Variável "usuário que disparou" | ✖ |
| Automações entre quadros | ✖ |
