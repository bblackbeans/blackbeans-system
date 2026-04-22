# blackbeans-system

Bootstrap inicial da plataforma com backend Django/DRF e frontend Next.js, seguindo a arquitetura definida nos artefatos BMAD.

## Estrutura base

- `blackbeans-api/`: backend gerado a partir de `cookiecutter-django`
- `blackbeans-web/`: frontend gerado com `create-next-app` (TypeScript + App Router)
- `infra/`: stack Docker de desenvolvimento (`api`, `web`, `worker`, `redis`, `postgres`, `proxy`)

## Requisitos locais

- Docker + Docker Compose
- Node.js 22+
- Python 3.14+

## Bootstrap rapido

1. Instalar dependencias do frontend:

```bash
cd blackbeans-web && npm install
```

2. (Opcional) Ajustar variaveis em `infra/env/*.env.example` para seu ambiente local.

3. Subir stack local:

```bash
docker compose -f infra/docker-compose.dev.yml up --build
```

4. Endpoints principais:

- Web (direto): `http://localhost:13000`
- API (direto): `http://localhost:18000`
- Proxy (entrada unica web + api): `http://localhost:18080`

## Convencoes iniciais

- Backend/API: `snake_case`
- Componentes React: `PascalCase`
- Funcoes/variaveis frontend: `camelCase`
- Arquivos frontend: `kebab-case`
- Prefixo de API: `/api/v1`

## Smoke checks sugeridos

- `docker compose -f infra/docker-compose.dev.yml config`
- `docker compose -f infra/docker-compose.dev.yml up --build`
- `cd blackbeans-web && npm run lint`
