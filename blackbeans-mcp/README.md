# BlackBeans MCP

Servidor MCP para IAs (Cursor, Claude, etc.) operarem tarefas, status, tempo e sprints do BlackBeans.

## Pré-requisitos

1. API no ar (`http://localhost:18000/api/v1` no compose local).
2. Personal Access Token (`bb_pat_...`) criado em `POST /api/v1/me/api-tokens` (perfil / Conta) ou via curl.

```bash
curl -s -X POST http://localhost:18000/api/v1/me/api-tokens \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cursor MCP","expires_in_days":90}'
```

Guarde o campo `token` (só aparece uma vez).

## Cursor (stdio)

Em `~/.cursor/mcp.json` (ou settings MCP do projeto):

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

## HTTP hospedado

```bash
cd blackbeans-mcp
BLACKBEANS_API_URL=http://api:8000/api/v1 BLACKBEANS_PAT=bb_pat_... \
  uv run blackbeans-mcp --http --host 0.0.0.0 --port 8100
```

Endpoint MCP: `http://localhost:18100/mcp` (compose mapeia `18100:8100`).

## Tools

### v1
`whoami`, `list_my_tasks`, `search_tasks`, `get_task`, `create_task`, `update_task`, `set_task_status`, `set_task_assignee`, `list_task_statuses`, `list_assignees`, `list_boards`, `get_board`, `time_start|pause|resume|manual`, `list_sprints`, `get_sprint`

### v1.1 (staff)
`generate_sprint`, `lock_sprint`, `unlock_sprint`, `patch_sprint_item`, `add_task_comment`

## Segurança

- O MCP age **como o dono do PAT** (não use senha/2FA no MCP).
- Escopos do token: `tasks:read`, `tasks:write`, `time:write`, `sprints:read` (+ `sprints:write` só staff).
- Mutações destrutivas de sprint pedem `confirm=true`.
- Rate limit de PAT na API (~120 req/min).
