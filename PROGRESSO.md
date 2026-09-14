# PROGRESSO

## O que este projeto é hoje

Busca de acomodações ao vivo, **sem banco, sem login e sem histórico**. Você
busca, filtra e sai pelo link para o Airbnb. Os resultados existem enquanto a
aba estiver aberta.

| Item | Estado |
|---|---|
| `pnpm typecheck` · `build` · `lint` | ✅ |
| `pnpm test` | ✅ 116 testes |
| Rotas | `/api/search`, `/api/quotes`, `/api/geocode`, `/api/health` |
| Dependências externas em runtime | nenhuma além da origem e do Nominatim |

## A mudança de escopo

A spec original era outra coisa: um cache local em Postgres alimentado por
ingestão ampla, com rastreamento de preço no tempo e alertas. Isso foi
construído por inteiro — dez etapas, schema com PostGIS e RLS, query builder de
SQL parametrizado, cron diário — e depois **removido a pedido**, em favor de
uma ferramenta simples de busca ao vivo.

O que foi descartado, e por quê não dava para manter:

- **Rastreamento de preço, sparkline e alertas** (`price_drop`, `new_match`,
  `became_unavailable`). Comparar o preço de hoje com o de ontem exige guardar o
  de ontem. Sem persistência, não existe.
- **Conjuntos de filtros salvos** (`filter_sets`) e **triagem persistente**. A
  triagem continua, mas só durante a sessão.
- **Autenticação.** A trava fail-closed que eu tinha adicionado saiu junto: o
  app não guarda nada, então não há o que proteger.

O que sobreviveu quase intacto, porque nunca dependeu do banco: a camada de
providers com os dois adapters e a queda automática, os normalizadores
defensivos, o cálculo de preço, o vocabulário canônico de amenidades, o motor de
pontuação e toda a UI.

## O que mudou por dentro

**`lib/filters/build.ts` → `lib/filters/apply.ts`.** A `FilterDefinition`
continua a mesma, mas em vez de virar SQL parametrizado ela é avaliada em
memória. O universo de uma busca são as ~50–300 linhas que a origem devolveu, e
filtrar isso em JavaScript é instantâneo. Os 36 testes do builder viraram 30
testes do avaliador, cobrindo as mesmas famílias de filtro.

**PostGIS → haversine.** `ST_Distance` e `ST_DWithin` viraram cálculo esférico;
`ST_Within` virou ray casting. Nessas escalas a diferença é muito menor que os
~150 m de ofuscação que o Airbnb já introduz no pino do anúncio.

**`tsvector` → substring sem acento.** Sem Postgres não há busca full-text com
stemmer. Para listas curtas de termos como "barulho" ou "mofo", a busca por
substring normalizada acerta *mais*: agora "infiltracao" casa "infiltração", o
que o `tsvector` em português não fazia.

**Pipeline em dois passos.** `POST /api/search` faz uma chamada e volta em
segundos com a diária anunciada. `POST /api/quotes` é o passo caro — uma chamada
por anúncio, a 1 req/s — e roda só sobre o que sobrou dos filtros, quando o
usuário clica. A rota respeita um orçamento de 50s e devolve o parcial com
`remaining` em vez de estourar o teto de 60s da Vercel e perder tudo.

**Ausência de dado não elimina a linha.** Decisão que atravessa o avaliador
inteiro: a origem omite campos o tempo todo, e descartar um anúncio porque ela
não informou o número de camas seria punir o anúncio por uma lacuna dela. Vale
também para o preço real — anúncio ainda não cotado não é removido por filtro de
taxa de limpeza, senão o filtro esconderia justamente o que falta cotar.

## Decisões que continuam valendo

- **A diária efetiva é a métrica principal**, e aparece sempre ao lado da
  anunciada. É o argumento de venda do produto e não fica atrás de um clique.
- **Estado vazio diz qual filtro zerou.** Cada predicado é contado isoladamente;
  quando nenhum zera sozinho, a tela mostra os três mais restritivos.
- **Amenidades por árvore clicável**, não por texto livre.
- **Score com decomposição no hover.** Sem isso seria um número opaco
  substituindo outro.
- **Rate limit de 1 req/s, chamadas em sequência.** Bloqueio de IP é o cenário
  de falha realista.

## Pendências conhecidas

- **Os dois adapters nunca falaram com a origem de verdade.** Não há
  `APIFY_TOKEN` configurado, e os parsers são testados contra fixtures gravadas.
  Os seletores do adapter `direct` (regex da chave, caminhos de preço) **vão
  precisar de ajuste no primeiro contato real** — é o modo de falha previsto, não
  surpresa. A varredura por formato em `lib/providers/direct/shape.ts` existe
  para sobreviver a mudanças de layout do GraphQL.
- **Sem login, a URL é pública.** Não há dado guardado, mas qualquer um com o
  link consegue disparar buscas contra a origem usando o seu IP de saída. Se
  isso incomodar, o Vercel Authentication resolve sem mexer no código.
- **O polígono manual não tem editor no mapa.** O filtro funciona e está
  testado, mas ainda não há como desenhar a área na tela.
- **O cache de geocoding vive na memória da instância** e some a cada cold
  start. Dentro de uma sessão de uso ele evita repetir endereços, que é onde
  importa para a política do Nominatim.
- **Comparação lado a lado saiu** junto com as rotas antigas; a seleção múltipla
  na tabela continua, sem tela de destino.

## Repositório

Branch `main`, 12 commits até a spec original completa, mais a reescrita para o
modelo ao vivo. O histórico do modelo com banco continua acessível — nada foi
reescrito, só removido daqui para frente.
