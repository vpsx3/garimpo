# Garimpo

Busca avançada de acomodações (Airbnb) com filtros compostos.

Os filtros nativos do Airbnb são rasos e não combináveis: não dá para ordenar
por preço **total real**, filtrar por sub-notas, excluir anúncios pelo texto das
avaliações, medir distância a pontos arbitrários ou combinar amenidades com
lógica booleana. O Garimpo resolve isso com uma decisão simples:

> **Ingerir amplo, filtrar local.**

A consulta feita à origem usa só o que ela suporta bem (localização, datas,
hóspedes, teto de preço bruto). Todo o resto roda em SQL sobre um cache local em
Postgres — o que torna qualquer combinação de filtro possível e mantém o sistema
vivo quando a origem muda.

## Stack

| Camada | Escolha |
|---|---|
| App | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + componentes shadcn/ui |
| Banco | Supabase (Postgres + PostGIS) |
| Validação | Zod |
| Jobs | Vercel Cron + Route Handlers |
| Deploy | Vercel |
| Geocoding | Nominatim (OSM), cacheado em banco |

## Setup

```bash
pnpm install
cp .env.example .env.local   # preencha as chaves
pnpm dev
```

Comandos:

```bash
pnpm typecheck   # tsc --noEmit
pnpm build       # next build
pnpm test        # vitest
pnpm lint        # eslint
```

### Banco

O app fala com o Postgres do Supabase por conexão direta (`postgres.js`), não
por PostgREST — o query builder de filtros exige SQL parametrizado real
(`ST_DWithin`, `@>` com lógica booleana aninhada, `tsquery` correlacionado).

Preencha `DATABASE_URL` com a string do **connection pooling** (Supavisor, porta
6543). Alternativamente, defina `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD`
e o app monta a URL sozinho, testando os hosts `aws-1-*` e `aws-0-*` do pooler.

A conexão direta `db.<ref>.supabase.co` é IPv6-only e **não** funciona na
Vercel; use sempre o pooler.

### Provider de ingestão

`SEARCH_PROVIDER` escolhe o adapter:

- `apify` — actor de scraping via REST. Custo por resultado, manutenção
  terceirizada. Requer `APIFY_TOKEN` e `APIFY_ACTOR_ID`.
- `direct` — GraphQL interna do Airbnb. Gratuito, porém quebra
  periodicamente. Chave e hashes de operação são extraídos em runtime, nunca
  hardcodados. Ao falhar com `ProviderStaleError`, o sistema cai
  automaticamente para `apify` quando há token configurado.

`/api/health` reporta o provider ativo e o estado do banco.

## Escopo

Ferramenta pessoal, estritamente de **leitura e análise**. Não reserva, não
paga, não escreve nada na origem — o usuário sempre finaliza no site oficial.
A aplicação não é exposta publicamente: fica atrás de Vercel Authentication e
o banco tem RLS ativo.

Os Termos de Serviço do Airbnb proíbem coleta automatizada. O projeto opera numa
zona cinzenta tolerável para uso pessoal e baixo volume; não serve de base para
produto comercial sem fonte licenciada.
