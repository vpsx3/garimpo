# PROGRESSO

Registro de execução da spec do Garimpo. Uma sessão, dez etapas, sem pausas.

---

## Estado geral

| Item | Estado |
|---|---|
| Etapas 0–9 implementadas | ✅ todas |
| `pnpm typecheck` | ✅ passa |
| `pnpm build` | ✅ passa |
| `pnpm lint` | ✅ passa |
| `pnpm test` | ✅ 127 testes |
| Projeto Supabase | ✅ `garimpo` (`qlkuzbqdojnxcsebhsys`, sa-east-1) |
| Schema + PostGIS + RLS | ✅ aplicado e verificado |
| **Deploy na Vercel** | ❌ **bloqueado — ver §Bloqueio** |
| URL de produção | ❌ não existe (consequência do bloqueio) |

---

## Bloqueio: criação do projeto na Vercel

**A Etapa 0 não pôde ser concluída.** Todas as tentativas de criar o projeto
na Vercel foram recusadas:

```
create_git_project  → 403 forbidden
  {"code":"forbidden","message":"You don't have permission to create the project.",
   "action":"create","resource":"project"}

deploy_to_vercel    → 403 forbidden
  {"code":"forbidden","message":"You don't have permission to create a Preview
   Deployment for this Vercel project: garimpo.",
   "link":"https://vercel.com/docs/accounts/team-members-and-roles"}
```

O time visível é `viniciuspiresxgmailcoms-projects` (`team_smM0CmNHMd7krwnPyUCW83J2`,
plano hobby). `get_project garimpo` devolve 404 — o projeto não existe. O erro
aponta para papéis de membro, ou seja, a conexão da Vercel nesta sessão não tem
permissão de escrita. Não é algo que dê para contornar por dentro.

Consequências, todas em cascata a partir daqui:

- Não há URL de produção.
- **Vercel Authentication não pôde ser ativado** (`update_project_deployment_protection`
  exige um projeto).
- O cron diário não roda — a configuração está pronta em `vercel.json`, mas cron
  só existe depois do deploy.
- A conexão com o Postgres não foi exercitada de dentro da Vercel (ver
  §Verificação).

### O que fazer para destravar

1. Reconectar a Vercel com permissão de escrita, ou criar o projeto `garimpo`
   manualmente no dashboard, ligado a `vpsx3/garimpo`.
2. Definir as variáveis de ambiente (lista em `.env.example`). No mínimo:
   `DATABASE_URL` (ou `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD`),
   `APP_ACCESS_PASSWORD`, `CRON_SECRET`, `SEARCH_PROVIDER`.
3. Ligar **Vercel Authentication** cobrindo produção e previews.
4. Abrir `/api/health` — ela reporta o estado do banco e o provider ativo, e é
   a forma de confirmar que o pooler foi alcançado.

---

## Proteção de acesso

A spec exige que a aplicação nunca fique exposta sem autenticação (§12). Como o
Vercel Authentication não pôde ser ativado, **a aplicação passou a carregar a
própria trava**, em vez de ficar desprotegida:

- `middleware.ts` barra toda rota sem sessão válida.
- A sessão é um cookie HttpOnly assinado com HMAC-SHA256 (Web Crypto, porque o
  middleware roda no runtime Edge).
- **Fail closed:** sem `APP_ACCESS_PASSWORD` definida, a aplicação recusa toda
  requisição com 503. Não existe estado "aberto por engano".
- Rotas `/api/cron/*` autenticam por `Authorization: Bearer $CRON_SECRET`.

Esta camada **soma-se** ao Vercel Authentication; não o substitui. Ligue os dois.

---

## Etapas

### Etapa 0 — Bootstrap · parcial
Next.js 15 (App Router) + TypeScript + Tailwind v4 + primitivos shadcn/ui
escritos no repositório. Projeto Supabase criado via MCP. `.env.example`, README,
scripts `typecheck`/`build`/`test`/`lint`.
Vercel: **bloqueado** (acima). Proteção de acesso resolvida no app.
`0efd63e`, `db7f243`

### Etapa 1 — Schema · ✅
Todas as tabelas de §6, PostGIS habilitado, trigger populando `listings.geo` a
partir de lat/lng, `tsvector` em português nas avaliações, índices GIN
(amenidades, texto) e GIST (geografia). RLS ligado nas 9 tabelas, uma policy de
usuário único em cada. Tipos gerados em `lib/db/types.ts`. Migrations espelhadas
em `supabase/migrations/`.
`6b0af3c`

### Etapa 2 — Providers · ✅
Interface `SearchProvider` com os dois adapters, trocáveis por `SEARCH_PROVIDER`.
O `direct` extrai chave e `sha256Hash` em runtime e lança `ProviderStaleError`
quando a extração falha; o `FallbackProvider` captura e refaz na Apify sem erro
visível. Rate limiter global, backoff exponencial, `raw` persistido antes do
parsing. Fixtures em `lib/providers/__fixtures__/`.
`09fa77a`

### Etapa 3 — Ingestão · ✅
`POST /api/searches/[id]/ingest`. Dedup por `(provider, external_id)` com
COALESCE no UPDATE. Cálculo de `effective_nightly` e `price_per_person`.
Vocabulário canônico de amenidades.
`0ee1abb`

### Etapa 4 — Query builder · ✅
`FilterDefinition` em Zod cobrindo todo o §7. `lib/filters/build.ts` emite
`{ text, params }` — valores nunca entram no texto. 36 testes cobrem cada
família de filtro e a árvore booleana aninhada.
`d30771f`

### Etapa 5 — UI · ✅
`/` e `/search/[id]`. Painel de filtros com contador ao vivo (debounce 300ms),
tabela densa ordenável, drawer de detalhe, `filter_sets`, triagem, comparação
lado a lado em `/search/[id]/compare`.
`5923b1a`

### Etapa 6 — Enriquecimento · ✅
Etapas C/D/E do pipeline sobre o subconjunto filtrado. Cache por idade: detalhe
e avaliações 7 dias, cotação 24h. Filtros textuais com destaque de termos.
`9c7c548`

### Etapa 7 — Geografia · ✅
CRUD de âncoras, geocoding Nominatim cacheado, `ST_DWithin` com AND/OR e margem
de tolerância, coluna de distância por âncora, mapa em `/search/[id]/map`.
`5d7f7b4`

### Etapa 8 — Pontuação · ✅
Motor de §9 com normalização min-max no conjunto atual, `log1p` em `review_count`,
quatro presets, sliders e decomposição no hover.
`51e35cd`

### Etapa 9 — Alertas · ✅
Cron diário (`vercel.json`), detecção de `price_drop` / `new_match` /
`became_unavailable`, feed em `/alerts`, sparkline na tabela, e-mail via Resend
atrás de env var.
`8fd8f30`

---

## Verificação

O sandbox desta sessão só permite saída HTTPS por proxy — **TCP direto na porta
6543 é bloqueado**, então a conexão do app com o pooler do Supabase não pôde ser
testada daqui. `/api/health` existe justamente para fechar essa lacuna a partir
da Vercel.

O que **foi** verificado, executando SQL real contra o banco pelo MCP:

- A consulta completa do query builder, com **todas** as famílias de filtro
  ativas ao mesmo tempo (preço, sub-notas, texto, amenidades booleanas,
  estrutura, anfitrião, políticas, três predicados geográficos, triagem),
  executa sem erro. As consultas de contagem e de diagnóstico também.
- Com dados semeados: o trigger de `geo` populou a coluna, `ST_Distance`
  devolveu 957 m e 1365 m, o `ST_DWithin` com tolerância funcionou, o
  `plainto_tsquery('portuguese')` casou "barulho de obra" e "cheiro de mofo",
  e a expressão `ar_condicionado AND (lavadora OR secadora) AND NOT
  banheiro_compartilhado` separou corretamente os dois anúncios.
- **A tese do produto, medida:** dois anúncios com a *mesma* diária anunciada
  (R$ 200) e diárias efetivas de R$ 230 e R$ 360 — 56% de diferença, invisível
  na busca nativa.
- Detecção de queda de preço: a queda de 16,7% gerou alerta, a de 2% não, e
  rodar a detecção de novo não duplicou o alerta.
- Os dados de teste foram apagados; o banco está vazio.
- `get_advisors` (security): nenhum aviso.

---

## Decisões tomadas sem consulta

Todas dentro da delegação de §15.

**Conexão ao Postgres por `postgres.js`, não por supabase-js.** O produto é um
query builder de filtros compostos; PostgREST não expressa `ST_DWithin`,
contenção de array com booleana aninhada nem `tsquery` correlacionado sem uma
RPC por filtro. Além disso o MCP não expõe a `service_role`, e usar a chave
anônima deixaria os dados legíveis por qualquer um com a URL — o que §12 proíbe.
Criei um papel dedicado `garimpo_app` com senha própria (não versionada) e
policies de RLS para ele.

**Failover entre hosts do pooler.** A conexão direta `db.<ref>.supabase.co` é
IPv6-only e não funciona na Vercel; o host do Supavisor varia entre `aws-0-*` e
`aws-1-*` por projeto e eu não conseguia testar daqui. `lib/db/client.ts` tenta
os dois e memoriza o que conectar. Definir `DATABASE_URL` explicitamente
curto-circuita isso.

**O query builder emite `{ text, params }` em vez de fragmentos do driver.**
Continua parametrizado (valores vão como parâmetros de protocolo), e torna o
builder inteiro testável sem banco — o que importou muito, já que não havia banco
alcançável daqui.

**Next.js 15.5.4 pinado.** `create-next-app@latest` instala a 16; a spec pede a
15 e eu segui a spec.

**Componentes shadcn/ui escritos no repositório** em vez de gerados pelo CLI
(que é interativo). São os mesmos componentes, copiados como o shadcn propõe.

**Tema e tokens de cor próprios** — a spec não especifica, então escolhi uma
paleta quente e sóbria coerente com o nome.

**`plainto_tsquery` por termo** em vez de montar uma string de tsquery. Concatenar
seria injetável e quebraria com qualquer pontuação digitada.

**Ausência de dado vale 0,5 no scoring**, não 0: zerar puniria o anúncio por uma
lacuna da origem, não por um defeito dele.

**Snapshots marcam a origem do preço** (`source`: `search` vs `quote`). Não está
em §6, mas sem isso não dá para distinguir estimativa de cotação real — e a UI
precisa avisar qual é qual.

**`geocode_cache` e `searches.last_ingested_at`** acrescentados ao schema. O
cache é exigência da política de uso do Nominatim; o timestamp alimenta a tela
inicial.

**Tipos gerados enxutos.** `lib/db/types.ts` traz o `Database` completo, mas os
helpers genéricos do supabase-js foram substituídos por equivalentes de três
linhas, já que o projeto não usa supabase-js.

---

## Divergências da spec

**Branch.** A spec manda `git push origin main`. Esta sessão foi aberta com uma
política de branch que fixa `claude/nifty-sagan-w1gwgx` e proíbe push para
qualquer outra. Respeitei a política: todos os onze commits estão nessa branch.
Para virar produção, faça merge em `main` — que hoje não existe no repositório,
embora conste como branch padrão.

**O repositório é público.** `vpsx3/garimpo` está com visibilidade pública. Não
há segredo commitado (verifiquei), mas para uma ferramenta pessoal que opera na
zona cinzenta dos ToS do Airbnb (§13), convém torná-lo privado. Não mexi nisso
por conta própria.

**Sem deploy, sem rollback.** O procedimento de rollback de §11 não chegou a ser
exercitado porque nenhum deploy aconteceu.

---

## Pendências conhecidas

- **Os dois adapters nunca falaram com a origem de verdade.** Não há
  `APIFY_TOKEN` nesta sessão, e chamar o Airbnb a partir do sandbox não seria
  representativo. Os parsers são testados contra fixtures gravadas; os seletores
  do adapter `direct` (regex da chave, caminhos de preço) **vão precisar de
  ajuste no primeiro contato real** — é o modo de falha previsto em §13, não
  surpresa. A varredura por formato em `lib/providers/direct/shape.ts` foi
  escrita justamente para sobreviver a mudanças de layout.
- **Busca textual é sensível a acento.** `tsv` usa `to_tsvector('portuguese')`
  sem `unaccent`, então "infiltracao" não casa "infiltração". A extensão
  `unaccent` já está instalada; resolver exige mudar a coluna gerada e reindexar.
- **Polígono manual não tem editor no mapa.** O filtro `ST_Within` está
  implementado e testado, mas a UI ainda não desenha o polígono — a aba de mapa
  mostra marcadores e raios das âncoras.
- **`bbox` em `searches` existe no schema e não é usada** por nada ainda.
- **Sem dado real, os critérios de aceite de §14 que dependem de ingestão**
  (≥ 50 anúncios em Lisboa, sparkline após duas ingestões) só puderam ser
  validados com dados semeados à mão, como descrito em §Verificação.
