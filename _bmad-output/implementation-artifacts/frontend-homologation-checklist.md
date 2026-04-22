# Frontend Homologation Checklist

## 1) Acesso e sessao

- [ ] Login com credenciais validas gera etapa de 2FA.
- [ ] Login com credenciais invalidas mostra mensagem clara sem quebrar UI.
- [ ] Verificacao 2FA com codigo valido conclui sessao.
- [ ] Refresh de sessao funciona sem logout indevido.
- [ ] Logout limpa sessao e retorna para tela de login.

## 2) Governanca e seguranca

- [ ] Consulta de matriz de permissoes retorna dados de workspace valido.
- [ ] Iniciar ativacao TOTP retorna chave manual e URI.
- [ ] Confirmar ativacao TOTP retorna recovery codes.
- [ ] Desativar TOTP com codigo valido funciona.
- [ ] Banner de erro global aparece quando backend falha e pode ser fechado.

## 3) Operacoes e CRUD

- [ ] Criar cliente/workspace/portfolio/projeto funciona via formulario.
- [ ] Editar cliente/workspace/portfolio/projeto atualiza tabela.
- [ ] Excluir workspace/portfolio/projeto respeita regras de dependencia.
- [ ] Alternar status de cliente funciona com feedback de sucesso.
- [ ] Atualizar status de projeto funciona com feedback.

## 4) Kanban e tarefas

- [ ] Criar board e grupo no Kanban funciona.
- [ ] Criar tarefa no board selecionado funciona.
- [ ] Mover tarefa de coluna atualiza grupo via API.
- [ ] Drawer abre com atividade, tempo e formulario de edicao rapida.
- [ ] Edicao rapida (titulo/prioridade/grupo) salva corretamente.

## 5) Filtros e persistencia

- [ ] Filtro de status em Minhas tarefas funciona.
- [ ] Busca por titulo em Minhas tarefas funciona.
- [ ] Filtros persistem apos recarregar pagina.
- [ ] Board selecionado no Kanban persiste apos recarregar pagina.

## 6) Qualidade visual e tecnica

- [ ] Layout permanece utilizavel em desktop e tablet.
- [ ] Nenhuma acao principal resulta em erro de runtime no navegador.
- [ ] `npm run lint` sem erros.
- [ ] `npm run build` sem erros.
