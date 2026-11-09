# Roteiro de teste: automações, copiar tarefa e correções

## 0. Preparar o ambiente

O sistema local sobe com Docker (api, web, worker, postgres, redis e proxy):

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

Depois de puxar estas mudanças, aplique as migrações, reinicie API e worker e carregue os dados de demonstração. Dentro do container da API o Python fica em `/app/.venv/bin/python`:

```bash
docker compose -f infra/docker-compose.dev.yml exec api /app/.venv/bin/python manage.py migrate
docker compose -f infra/docker-compose.dev.yml restart api worker
docker compose -f infra/docker-compose.dev.yml exec api /app/.venv/bin/python manage.py seed_qa_demo
docker compose -f infra/docker-compose.dev.yml exec api /app/.venv/bin/python manage.py seed_automations_demo
```

- Abra `http://localhost:18080` e entre com `admin.teste` / `Admin!Teste2025#` (usuário de teste do seed). Colaboradores de teste: senha `Colab!Demo2025#`.
- Se aparecer o tour de novidades da versão, feche com Esc.
- **O container `worker` precisa estar de pé**: as automações por evento rodam nele (Celery). Os gatilhos de prazo e de horário recorrente rodam a cada 15 min pelo beat, que sobe junto com o worker (`-B`).
- Menu lateral: Administração → Automações.

## 1. Automações (menu Administração → Automações)

1. A lista deve mostrar as 8 automações `[DEMO]`, com a chave de ativar/desativar.
2. **Criar do zero:** "Nova automação" → Quando: *status mudar para Bloqueada* → Então: *alterar prioridade para Alta*. Salve.
3. Abra uma tarefa do board demo, mude o status para Bloqueada e aguarde alguns segundos. A prioridade deve virar Alta e a aba de histórico da tarefa mostra "[Automação: …]".
4. **Condição:** adicione "título contém urgente". Mude o status de uma tarefa sem "urgente" no título: nada deve acontecer.
5. **Receitas prontas:** "Receitas prontas" → escolha uma → ela abre preenchida no construtor.
6. **Botão Testar (▶):** copie o link da tarefa (botão "Copiar link"), cole no modal, deixe "somente simular" ligado. O resultado mostra o que seria feito e a tarefa não muda. Desligue a chave para executar de verdade.
7. **Histórico:** o ícone de relógio na linha mostra cada execução, a tarefa e o resultado de cada ação. Falhas aparecem em vermelho com o motivo.
8. **Anti-laço:** crie duas automações que se desfazem (prioridade alta→baixa e baixa→alta). Mude a prioridade uma vez: o histórico deve parar sozinho em poucas execuções.
9. **Prazo:** na receita "Venceu? Escale a prioridade", deixe uma tarefa com prazo no passado. Ela dispara no próximo ciclo de 15 min, uma única vez por tarefa.

10. **Abas Gerir / Criar** (como na Central de Automações do Monday): *Gerir* lista, liga/desliga, testa e exclui; *Criar* tem "Criar do zero" e os modelos prontos.
11. **Importância:** no editor escolha Crítica/Alta/Normal/Pequena. Aparece como etiqueta na lista e dá para filtrar. É só organização: não muda a ordem de execução (igual ao Monday).
12. Rode `python manage.py migrate` antes (migração `automations.0003`).

13. **Editor em frase:** o editor mostra "Quando ... / Se ... / Então ... / E também ..." com campos sublinhados.
14. **Duplicar:** ícone de copiar na linha abre uma cópia no editor ("Cópia de ..."); só vira automação ao salvar.
15. **Falha não para as ações seguintes** (igual ao Monday): crie uma automação com uma ação que falha (status inexistente) seguida de "alterar prioridade". A prioridade muda e o histórico marca a primeira em vermelho.
16. **Excluir a tarefa:** nova ação, definitiva. Teste só com "somente simular" ligado.

17. **Novos gatilhos:** "nome da tarefa mudar", "mudar de quadro", "ser arquivada". Crie uma com ação "Definir pontos de esforço" e renomeie uma tarefa.
18. **Subtarefas:** use a condição "Tarefa pai não está vazio" para valer só em subtarefas.
19. **Ações entre quadros:** "Mover para outro quadro" (leva as subtarefas), "Duplicar a tarefa", "Criar tarefa em um quadro" e "Empurrar uma data" (dias, semanas ou meses). O destino só lista grupos da mesma área de trabalho. Use "somente simular" primeiro.
20. Cuidado com laços: "Duplicar" ou "Criar tarefa" em uma automação de "tarefa criada" gera novas tarefas em cadeia. O anti-laço corta em 4 níveis, mas teste com simulação.

## 2. Copiar na tela da tarefa

Abra qualquer tarefa:

- No topo, **Copiar tudo** copia título, status, responsável, prazos, descrição, subtarefas e comentários (em ordem cronológica) como texto, e **Copiar link** continua igual.
- Na descrição, o botão **Copiar** copia o texto. Cole no Google Docs ou e-mail para ver a formatação preservada, e num campo simples para ver só texto.
- Em cada comentário e resposta, o botão **Copiar** copia autor, data e texto.
- Ao abrir outra tarefa, comentários, histórico e tempo da anterior somem na hora e aparece um esqueleto de carregamento no lugar do "Ainda não há atualizações".

## 3. Correções de segurança e erros (API)

Rode `docker compose -f infra/docker-compose.dev.yml exec api pytest` (esperado: tudo verde). Manualmente:

- Usuário colaborador **sem acesso** ao workspace: abrir comentários, histórico ou tempo de uma tarefa de outro workspace agora retorna 403 (antes liberava).
- `GET /api/v1/tasks?board_id=abc` retorna 400 (antes 500).
- Atribuir responsável com ID inexistente retorna 400 (antes 500).
- Mover tarefa para grupo de um quadro sem acesso retorna 403.

## 4. O que NÃO foi feito (decisões suas)

- **Portal do cliente** mostra todos os comentários da tarefa na devolutiva, inclusive os internos. Pode ser intencional; se não for, precisamos de um marcador "interno" no comentário.
- **Dependências entre tarefas** têm API, mas a tela não usa (`/tasks/{id}/dependencies`).
- Possível **tempo duplicado** ao dar duplo clique em iniciar (sem trava no banco).
- Possível **número de tarefa duplicado** em criações simultâneas.
- `mark_overdue_tasks` sobrescreve o status original da tarefa por "atrasada".
