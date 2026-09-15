# BlackBeans MCP

Servidor MCP para IAs (Cursor, Claude, etc.) operarem tarefas, status, tempo e sprints do BlackBeans.

## Pré-requisitos

1. API no ar (`http://localhost:18000/api/v1` no compose local).
2. Personal Access Token (`bb_pat_...`) criado na Conta (Tokens de API) ou via:

```bash
curl -s -X POST http://localhost:18000/api/v1/me/api-tokens \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cursor MCP","expires_in_days":90}'
```

Guarde o campo `token` (só aparece uma vez). **Cada usuário gera e usa o próprio PAT.**

## Autenticação

Ordem de resolução do token:

1. Header HTTP `Authorization: Bearer bb_pat_…` (cliente remoto / multi-user)
2. Env `BLACKBEANS_PAT` ou `BLACKBEANS_API_TOKEN` (stdio local)

Em produção HTTP **não** defina `BLACKBEANS_PAT` no servidor — cada cliente envia o seu Bearer.

## HTTP hospedado (recomendado em produção)

URL típica EasyPanel: `https://…-bb-system-mcp…/mcp`

No Cursor / Claude Code (`mcp.json`):

```json
{
  "mcpServers": {
    "blackbeans": {
      "url": "https://blackbeans-system-bb-system-mcp.psvs5z.easypanel.host/mcp",
      "headers": {
        "Authorization": "Bearer bb_pat_TOKEN_DA_PESSOA"
      }
    }
  }
}
```

Variáveis do container MCP (só API; sem PAT compartilhado):

```bash
BLACKBEANS_API_URL=http://api:8000/api/v1
MCP_HOST=0.0.0.0
MCP_PORT=8100
```

Opcional: restringir o domínio/IP do serviço MCP no EasyPanel se quiserem reduzir superfície pública (VPN/allowlist não está neste escopo).

## Cursor (stdio local)

Em `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "blackbeans": {
      "command": "uv",
      "args": ["--directory", "/ABS/PATH/blackbeans-system/blackbeans-mcp", "run", "blackbeans-mcp"],
      "env": {
        "BLACKBEANS_API_URL": "http://localhost:18000/api/v1",
        "BLACKBEANS_PAT": "bb_pat_SEU_TOKEN"
      }
    }
  }
}
```

Compose local também pode expor HTTP em `http://localhost:18100/mcp` (mapeia `18100:8100`).

## Tools

### Leitura / tarefas
`whoami`, `list_my_tasks` (filtro `overdue`), `search_tasks` (`assignee_id`, `status`, …), `get_task`, `list_task_statuses`, `list_assignees`, `list_boards`, `get_board`

### Mutação
`create_task` / `update_task` (`assignee_id`, datas, `effort_points`, …), `set_task_status`, `set_task_assignee`, `delete_task` (`confirm=true`, **somente staff/admin** na API)

### Tempo / sprints
`time_start|pause|resume|manual`, `list_sprints`, `get_sprint`

### v1.1 (staff)
`generate_sprint`, `lock_sprint`, `unlock_sprint`, `patch_sprint_item`, `add_task_comment`

## Segurança

- O MCP age **como o dono do PAT** (não use senha/2FA no MCP).
- Escopos do token: `tasks:read`, `tasks:write`, `time:write`, `sprints:read` (+ `sprints:write` só staff).
- Mutações destrutivas pedem `confirm=true` (`delete_task`, sprints).
- Colaborador sem permissão de staff recebe **403** em `delete_task`.
- Rate limit de PAT na API (~120 req/min).
- Audit log: tool, outcome e **prefixo** do PAT (nunca o secret completo).
- Após deploy multi-user: **remova** `BLACKBEANS_PAT` do env do serviço MCP no EasyPanel.
