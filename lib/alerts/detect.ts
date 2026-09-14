import type { Sql } from "postgres";
import { getSql } from "@/lib/db/client";
import { buildCountQuery } from "@/lib/filters/build";
import { filterDefinitionSchema } from "@/lib/filters/types";

/**
 * Detecção de alertas, rodada depois de cada re-ingestão.
 *
 * Três eventos: queda de preço, anúncio novo que bate um conjunto de filtros
 * salvo, e anúncio que saiu do ar. Todos comparam o snapshot recém-capturado
 * com o anterior — por isso a detecção precisa rodar logo após a ingestão,
 * enquanto "anterior" ainda significa a ingestão passada.
 */

/** Queda mínima para virar alerta. Abaixo disso é ruído de câmbio e taxa. */
export const PRICE_DROP_THRESHOLD = 0.05;

export type DetectionResult = {
  searchId: string;
  priceDrops: number;
  newMatches: number;
  becameUnavailable: number;
};

export async function detectAlerts(
  searchId: string,
  options: { since?: Date } = {},
): Promise<DetectionResult> {
  const sql = await getSql();
  const since = options.since ?? new Date(Date.now() - 6 * 3_600_000);

  return {
    searchId,
    priceDrops: await detectPriceDrops(sql, searchId, since),
    becameUnavailable: await detectUnavailable(sql, searchId, since),
    newMatches: await detectNewMatches(sql, searchId, since),
  };
}

/**
 * Queda ≥ 5% na diária efetiva entre os dois últimos snapshots do anúncio
 * dentro da busca. Comparar a efetiva, e não a anunciada, é o ponto: uma
 * "promoção" que sobe a taxa de limpeza não é queda de preço.
 */
async function detectPriceDrops(
  sql: Sql,
  searchId: string,
  since: Date,
): Promise<number> {
  const inserted = await sql<{ id: string }[]>`
    with ordenados as (
      select
        listing_id,
        captured_at,
        effective_nightly,
        lag(effective_nightly) over (
          partition by listing_id order by captured_at
        ) as anterior,
        row_number() over (
          partition by listing_id order by captured_at desc
        ) as posicao
      from listing_snapshots
      where search_id = ${searchId} and is_available
    ),
    quedas as (
      select listing_id, captured_at, effective_nightly, anterior
      from ordenados
      where posicao = 1
        and captured_at >= ${since}
        and anterior is not null
        and anterior > 0
        and effective_nightly is not null
        and effective_nightly < anterior * ${1 - PRICE_DROP_THRESHOLD}
    )
    insert into alerts (search_id, listing_id, kind, payload)
    select
      ${searchId}, q.listing_id, 'price_drop',
      jsonb_build_object(
        'from', q.anterior,
        'to', q.effective_nightly,
        'dropPct', round((1 - q.effective_nightly / q.anterior) * 100, 1),
        'capturedAt', q.captured_at
      )
    from quedas q
    -- Um alerta por queda, não um por execução do cron.
    where not exists (
      select 1 from alerts a
      where a.search_id = ${searchId}
        and a.listing_id = q.listing_id
        and a.kind = 'price_drop'
        and a.created_at >= q.captured_at
    )
    returning id
  `;
  return inserted.length;
}

async function detectUnavailable(
  sql: Sql,
  searchId: string,
  since: Date,
): Promise<number> {
  const inserted = await sql<{ id: string }[]>`
    with ordenados as (
      select
        listing_id,
        captured_at,
        is_available,
        lag(is_available) over (
          partition by listing_id order by captured_at
        ) as antes,
        row_number() over (
          partition by listing_id order by captured_at desc
        ) as posicao
      from listing_snapshots
      where search_id = ${searchId}
    ),
    sumiram as (
      select listing_id, captured_at
      from ordenados
      where posicao = 1
        and captured_at >= ${since}
        and is_available = false
        and antes = true
    )
    insert into alerts (search_id, listing_id, kind, payload)
    select
      ${searchId}, s.listing_id, 'became_unavailable',
      jsonb_build_object('capturedAt', s.captured_at)
    from sumiram s
    where not exists (
      select 1 from alerts a
      where a.search_id = ${searchId}
        and a.listing_id = s.listing_id
        and a.kind = 'became_unavailable'
        and a.created_at >= s.captured_at
    )
    returning id
  `;
  return inserted.length;
}

/**
 * Anúncio novo que passa num `filter_set` salvo.
 *
 * "Novo" é o anúncio cuja primeira aparição nesta busca é recente — não o
 * anúncio criado recentemente na origem, que é outra coisa.
 */
async function detectNewMatches(
  sql: Sql,
  searchId: string,
  since: Date,
): Promise<number> {
  const filterSets = await sql<{ id: string; label: string; definition: unknown }[]>`
    select id, label, definition from filter_sets
  `;

  let total = 0;

  for (const filterSet of filterSets) {
    const parsed = filterDefinitionSchema.safeParse(filterSet.definition);
    if (!parsed.success) continue;

    const { text, params } = buildCountQuery(searchId, parsed.data);

    // Mesma consulta de contagem, devolvendo ids em vez do total, restrita
    // aos anúncios que apareceram nesta busca depois de `since`.
    const selection = `${text.replace(
      "select count(*)::int as total",
      "select l.id",
    )} and l.id in (
      select sn.listing_id from listing_snapshots sn
      where sn.search_id = $${params.length + 1}
      group by sn.listing_id
      having min(sn.captured_at) >= $${params.length + 2}
    )`;

    const matches = await sql.unsafe<{ id: string }[]>(selection, [
      ...params,
      searchId,
      since,
    ] as never[]);

    if (matches.length === 0) continue;

    const inserted = await sql<{ id: string }[]>`
      insert into alerts (search_id, listing_id, kind, payload)
      select
        ${searchId}, m.listing_id, 'new_match',
        jsonb_build_object(
          'filterSetId', ${filterSet.id}::text,
          'filterSetLabel', ${filterSet.label}::text
        )
      from unnest(${matches.map((match) => match.id)}::uuid[]) as m(listing_id)
      where not exists (
        select 1 from alerts a
        where a.search_id = ${searchId}
          and a.listing_id = m.listing_id
          and a.kind = 'new_match'
          and a.payload->>'filterSetId' = ${filterSet.id}::text
      )
      returning id
    `;

    total += inserted.length;
  }

  return total;
}
