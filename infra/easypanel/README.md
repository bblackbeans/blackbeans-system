# Staging no EasyPanel

Esta configuracao sobe sete containers: `proxy`, `web`, `api`, `worker`, `beat`,
`postgres` e `redis`. O Nginx em `proxy` e o unico ponto de entrada publico;
banco, Redis e aplicacoes permanecem acessiveis apenas na rede interna.

## Deploy

1. No projeto vazio `blackbeans_system_staging`, crie um servico por Git source
   usando Compose e selecione a branch `feat/media-governance-module`.
2. Informe `infra/easypanel/docker-compose.staging.yml` como caminho do Compose.
   Os contexts `../../blackbeans-web` e `../../blackbeans-api` sao relativos a
   esse diretorio e apontam para as duas aplicacoes na raiz do repositorio.
3. Cadastre no ambiente do Compose as variaveis listadas em
   `staging.env.example`. Gere `DJANGO_SECRET_KEY` e `POSTGRES_PASSWORD` no
   EasyPanel; nunca cole segredos no YAML, no repositorio ou em logs/tickets.
4. Mantenha a API com **uma unica replica**. Somente no staging, seu comando
   executa `migrate --noinput` antes de `/start`; a migracao e idempotente, mas
   nao deve concorrer em replicas durante o deploy.
5. Depois que todos os healthchecks estiverem saudaveis, associe o dominio HTTPS
   ao servico `proxy`, porta 80. Atualize `FRONTEND_BASE_URL`,
   `DJANGO_ALLOWED_HOSTS` e, se aplicavel, `API_PUBLIC_BASE_URL`, e faca novo
   deploy. O Nginx encaminha `/api/v1/` e `/media/` para `api:5000`; todo o
   restante segue para `web:3000`.

## Persistencia e saude

Os unicos volumes persistentes sao `postgres_data`, `redis_data` (AOF) e
`django_media` para uploads. Nao ha bind mount do codigo. Postgres e Redis usam
checks nativos; a API consulta `/api/v1/health` (incluindo banco); o web verifica
a pagina inicial; o worker usa `celery inspect ping`; e o beat verifica seu
processo principal. `depends_on` impede a sequencia inicial enquanto as
dependencias ainda nao estiverem saudaveis.

## Rollback

Antes de publicar, registre a revisao Git atualmente implantada e garanta um
backup recuperavel do banco e do volume de media. Para rollback, selecione no
Git source a revisao anterior conhecida, redeploye a mesma configuracao e
confirme os healthchecks. Migracoes de banco nao sao revertidas automaticamente:
se uma versao exigir reversao de schema ou restauracao, trate isso como uma
operacao separada e validada antes de trocar a aplicacao.

## Segredos e integracoes opcionais

Use somente o armazenamento de ambiente/segredos do EasyPanel. Nao cadastre
`DATABASE_URL`: o entrypoint do Django a recompoe em runtime a partir de
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` e
`POSTGRES_PASSWORD`; por isso, a senha deve ser segura para uso em URL. SMTP, RD Station e
OpenAI/Composio ficam vazios/desligados inicialmente. Ative cada integracao
somente depois de cadastrar seus segredos e URLs de callback, sem expor chaves
como variaveis publicas do Next.js. Rotacione qualquer segredo que seja exibido
acidentalmente e redeploye os servicos consumidores.
