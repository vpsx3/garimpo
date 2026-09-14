# Garimpo

Busca de acomodações (Airbnb) com os filtros que a busca nativa não tem.

Sem banco, sem login, sem histórico. Você busca, filtra, e vai para o Airbnb
pelo link. Os resultados vivem enquanto a aba estiver aberta.

## O problema

Os filtros nativos do Airbnb são rasos e não combináveis. Não dá para ordenar
por **preço total real**, filtrar por sub-notas, excluir anúncios pelo texto das
avaliações, medir distância a pontos que você escolhe, ou combinar amenidades
com lógica booleana.

## Como funciona

> **Buscar amplo, filtrar local.**

A consulta enviada à origem usa só o que ela suporta bem — localização, datas,
hóspedes, teto de diária bruta. Todo o resto é aplicado no navegador, sobre as
~50–300 linhas que voltaram.

O fluxo tem dois passos, por um motivo concreto:

1. **Buscar** — uma chamada à origem. Volta em segundos com a diária anunciada,
   e todos os filtros já funcionam sobre isso.
2. **Calcular preço real** — uma chamada *por anúncio*, a 1 req/s. Traz limpeza,
   serviço, impostos e descontos, e calcula a **diária efetiva**: o total da
   estadia dividido pelas noites.

O passo 2 é um botão, não algo automático: em 30 anúncios são ~30 segundos.
Rodá-lo só sobre o que sobrou dos filtros é o que torna a conta viável — e é
por isso que ele fica *depois* dos filtros, não antes.

Um imóvel de R$ 200/noite com R$ 600 de limpeza custa R$ 500/noite reais numa
estadia de 2 noites e R$ 243 em 14. A busca nativa não distingue os dois. A
tabela mostra sempre a diária efetiva ao lado da anunciada.

## Filtros

Preço (diária efetiva, total, por pessoa, taxa de limpeza, % do total em
limpeza, delta vs. anunciada) · sub-notas de avaliação, volume, recência e
cadência · texto das avaliações, descrição e regras da casa, incluindo e
excluindo termos · amenidades com **E / OU / NÃO** aninhados · estrutura
(tipo, quartos, camas, banheiros, razão camas/hóspedes, fotos) · anfitrião
(Superhost, tempo de cadastro, nº de anúncios, taxa de resposta) · políticas
(reserva instantânea, cancelamento em escala ordenada, estadia mín./máx.) ·
geografia (distância a várias âncoras com E/OU, exclusão por raio, polígono) ·
triagem da sessão.

Tudo combinável. Quando o resultado zera, a tela diz **qual** filtro zerou.

## Ranqueamento

Soma ponderada de critérios normalizados min-max dentro do conjunto atual, com
quatro presets (custo-benefício, qualidade, localização, estadia longa). O score
não é opaco: passar o mouse mostra quanto cada critério contribuiu.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · componentes shadcn/ui ·
Zod · Leaflet/OSM para o mapa · Nominatim para geocoding.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm lint`

## Provider de ingestão

`SEARCH_PROVIDER` escolhe o adapter:

- **`direct`** — GraphQL interna do Airbnb. Gratuito e rápido. A chave da API e
  os hashes das operações persistidas são extraídos em runtime, nunca
  hardcodados. **Vai quebrar periodicamente** — é o modo de falha esperado.
- **`apify`** — actor de scraping via REST. Custa por resultado e transfere a
  manutenção da fragilidade para o fornecedor. Requer `APIFY_TOKEN` e
  `APIFY_ACTOR_ID`.

Quando o `direct` lança `ProviderStaleError`, o sistema cai para a Apify
automaticamente, sem erro visível — desde que haja token configurado.

## Escopo

Ferramenta de **leitura e análise**. Não reserva, não paga, não escreve nada na
origem: você finaliza no site oficial.

Os Termos de Serviço do Airbnb proíbem coleta automatizada. O projeto opera numa
zona cinzenta tolerável para uso pessoal e baixo volume; não serve de base para
produto comercial sem uma fonte licenciada. Bloqueio de IP é o cenário de falha
realista — o rate limiter de 1 req/s existe para adiar isso.
