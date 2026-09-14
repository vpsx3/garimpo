import { SqlBuilder, joinAnd, type Predicate } from "./sql";
import {
  CANCELLATION_RANK,
  type AmenityExpr,
  type CancellationPolicy,
  type FilterDefinition,
} from "./types";

/**
 * Tradução de `FilterDefinition` para SQL.
 *
 * Esta é a razão de existir do produto: dezenas de filtros que a origem não
 * combina, aplicados juntos numa única consulta sobre o cache local.
 *
 * A consulta parte do snapshot de preço mais recente de cada anúncio dentro
 * da busca — é sobre ele que os filtros de §7.1 operam.
 */

export type BuildOptions = {
  searchId: string;
  filter: FilterDefinition;
  orderBy?: OrderKey;
  orderDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type BuiltQuery = {
  text: string;
  params: unknown[];
  /** Predicados ativos, para o diagnóstico de estado vazio da UI. */
  predicates: Predicate[];
};

const ORDER_COLUMNS = {
  effective_nightly: "s.effective_nightly",
  total_price: "s.total_price",
  price_per_person: "s.price_per_person",
  cleaning_fee: "s.cleaning_fee",
  cleaning_ratio: "cleaning_ratio",
  price_honesty: "price_honesty",
  rating_overall: "l.rating_overall",
  rating_cleanliness: "l.rating_cleanliness",
  rating_location: "l.rating_location",
  review_count: "l.review_count",
  reviews_per_month: "l.reviews_per_month",
  beds: "l.beds",
  bedrooms: "l.bedrooms",
  person_capacity: "l.person_capacity",
  picture_count: "l.picture_count",
  last_review_at: "l.last_review_at",
  min_anchor_distance_m: "min_anchor_distance_m",
  title: "l.title",
} as const;

export type OrderKey = keyof typeof ORDER_COLUMNS;

export const ORDER_KEYS = Object.keys(ORDER_COLUMNS) as OrderKey[];

/**
 * Colunas derivadas que vários filtros e ordenações reaproveitam.
 * `nullif` evita divisão por zero — o resultado vira null e o filtro
 * simplesmente não casa, que é o comportamento correto.
 */
const DERIVED_COLUMNS = `
    s.cleaning_fee / nullif(s.total_price, 0) as cleaning_ratio,
    s.effective_nightly / nullif(s.gross_nightly, 0) as price_honesty,
    l.beds::numeric / nullif(l.person_capacity, 0) as beds_per_guest`;

export function buildFilterQuery(options: BuildOptions): BuiltQuery {
  const builder = new SqlBuilder();
  const searchParam = builder.param(options.searchId);
  const predicates = buildPredicates(options.filter, builder, searchParam);

  // Distância a cada âncora, e não só à mais próxima: a tabela mostra uma
  // coluna por âncora, porque "perto do escritório" e "perto da escola" são
  // perguntas diferentes.
  const anchorDistances = `
    (select min(extensions.ST_Distance(l.geo, a.geo))::int
      from anchors a where a.search_id = ${searchParam}) as min_anchor_distance_m,
    (select coalesce(json_agg(
        json_build_object(
          'anchorId', a.id,
          'label', a.label,
          'meters', extensions.ST_Distance(l.geo, a.geo)::int,
          'maxDistanceM', a.max_distance_m
        ) order by a.created_at
      ), '[]'::json)
      from anchors a where a.search_id = ${searchParam}) as anchor_distances`;

  const orderColumn = ORDER_COLUMNS[options.orderBy ?? "effective_nightly"];
  const orderDir = options.orderDir === "desc" ? "desc" : "asc";
  const limit = builder.param(Math.min(options.limit ?? 500, 2000));
  const offset = builder.param(Math.max(options.offset ?? 0, 0));

  const text = `
${latestSnapshotCte(searchParam)}
select
    l.*,
    s.captured_at,
    s.nights,
    s.gross_nightly,
    s.cleaning_fee,
    s.service_fee,
    s.taxes,
    s.discount_total,
    s.total_price,
    s.effective_nightly,
    s.price_per_person,
    s.currency,
    s.is_available,
    s.source as price_source,${DERIVED_COLUMNS},
    v.verdict,
    v.note as verdict_note,
    (select count(*)::int from listing_snapshots h
      where h.listing_id = l.id and h.search_id = ${searchParam}) as snapshot_count,${anchorDistances}
from listings l
join ultimo_snapshot s on s.listing_id = l.id
left join listing_verdicts v on v.listing_id = l.id
where ${joinAnd(predicates)}
order by ${orderColumn} ${orderDir} nulls last, l.id
limit ${limit} offset ${offset}`;

  return { text, params: builder.params, predicates };
}

/** Contagem para o contador ao vivo do painel de filtros. */
export function buildCountQuery(
  searchId: string,
  filter: FilterDefinition,
): BuiltQuery {
  const builder = new SqlBuilder();
  const searchParam = builder.param(searchId);
  const predicates = buildPredicates(filter, builder, searchParam);

  const text = `
${latestSnapshotCte(searchParam)}
select count(*)::int as total
from listings l
join ultimo_snapshot s on s.listing_id = l.id
left join listing_verdicts v on v.listing_id = l.id
where ${joinAnd(predicates)}`;

  return { text, params: builder.params, predicates };
}

/**
 * Diagnóstico de estado vazio (§10): em vez de "nenhum resultado", dizer
 * *qual* filtro zerou. Cada predicado ativo é contado isoladamente sobre o
 * conjunto da busca, numa única consulta.
 */
export function buildDiagnosticQuery(
  searchId: string,
  filter: FilterDefinition,
): BuiltQuery {
  const builder = new SqlBuilder();
  const searchParam = builder.param(searchId);
  const predicates = buildPredicates(filter, builder, searchParam);

  const columns = predicates.map(
    (predicate, index) =>
      `count(*) filter (where ${predicate.sql})::int as p${index}`,
  );

  const text = `
${latestSnapshotCte(searchParam)}
select
    count(*)::int as base${columns.length ? ",\n    " + columns.join(",\n    ") : ""}
from listings l
join ultimo_snapshot s on s.listing_id = l.id
left join listing_verdicts v on v.listing_id = l.id`;

  return { text, params: builder.params, predicates };
}

/**
 * Só o snapshot mais recente de cada anúncio dentro da busca. O histórico
 * continua na tabela — é dele que sai o sparkline e a detecção de queda.
 */
function latestSnapshotCte(searchParam: string): string {
  return `with ultimo_snapshot as (
    select distinct on (listing_id) *
    from listing_snapshots
    where search_id = ${searchParam}
    order by listing_id, captured_at desc
)`;
}

function buildPredicates(
  filter: FilterDefinition,
  builder: SqlBuilder,
  searchParam: string,
): Predicate[] {
  const predicates: Predicate[] = [];

  const add = (key: string, label: string, sql: string) => {
    predicates.push({ key, label, sql });
  };

  const compare = (
    key: string,
    label: string,
    column: string,
    operator: ">=" | "<=",
    value: number | null | undefined,
  ) => {
    if (value === null || value === undefined) return;
    add(key, label, `${column} ${operator} ${builder.param(value)}`);
  };

  // 7.1 Preço ------------------------------------------------------------
  compare("effectiveNightlyMin", "Diária efetiva mínima", "s.effective_nightly", ">=", filter.effectiveNightlyMin);
  compare("effectiveNightlyMax", "Diária efetiva máxima", "s.effective_nightly", "<=", filter.effectiveNightlyMax);
  compare("totalPriceMin", "Preço total mínimo", "s.total_price", ">=", filter.totalPriceMin);
  compare("totalPriceMax", "Preço total máximo", "s.total_price", "<=", filter.totalPriceMax);
  compare("pricePerPersonMax", "Preço por pessoa máximo", "s.price_per_person", "<=", filter.pricePerPersonMax);
  compare("cleaningFeeMax", "Taxa de limpeza máxima", "s.cleaning_fee", "<=", filter.cleaningFeeMax);

  if (filter.cleaningRatioMax !== null && filter.cleaningRatioMax !== undefined) {
    add(
      "cleaningRatioMax",
      "Razão limpeza/total máxima",
      `s.cleaning_fee / nullif(s.total_price, 0) <= ${builder.param(filter.cleaningRatioMax)}`,
    );
  }

  if (filter.onlyWithDiscount) {
    add("onlyWithDiscount", "Só com desconto aplicado", "coalesce(abs(s.discount_total), 0) > 0");
  }

  if (filter.priceHonestyMax !== null && filter.priceHonestyMax !== undefined) {
    add(
      "priceHonestyMax",
      "Delta vs. diária anunciada",
      `s.effective_nightly / nullif(s.gross_nightly, 0) <= ${builder.param(filter.priceHonestyMax)}`,
    );
  }

  if (filter.onlyAvailable) {
    add("onlyAvailable", "Só disponíveis", "s.is_available");
  }

  // 7.2 Avaliações -------------------------------------------------------
  compare("ratingOverallMin", "Nota geral mínima", "l.rating_overall", ">=", filter.ratingOverallMin);
  compare("ratingCleanlinessMin", "Limpeza mínima", "l.rating_cleanliness", ">=", filter.ratingCleanlinessMin);
  compare("ratingLocationMin", "Localização mínima", "l.rating_location", ">=", filter.ratingLocationMin);
  compare("ratingValueMin", "Custo-benefício mínimo", "l.rating_value", ">=", filter.ratingValueMin);
  compare("ratingCheckinMin", "Check-in mínimo", "l.rating_checkin", ">=", filter.ratingCheckinMin);
  compare("ratingCommunicationMin", "Comunicação mínima", "l.rating_communication", ">=", filter.ratingCommunicationMin);
  compare("ratingAccuracyMin", "Veracidade mínima", "l.rating_accuracy", ">=", filter.ratingAccuracyMin);
  compare("reviewCountMin", "Nº mínimo de avaliações", "l.review_count", ">=", filter.reviewCountMin);
  compare("reviewsPerMonthMin", "Avaliações/mês mínimo", "l.reviews_per_month", ">=", filter.reviewsPerMonthMin);

  if (filter.lastReviewWithinDays) {
    add(
      "lastReviewWithinDays",
      "Avaliação recente",
      `l.last_review_at >= current_date - ${builder.param(filter.lastReviewWithinDays)}::int`,
    );
  }

  if (filter.onlyWithoutReviews === true) {
    add("onlyWithoutReviews", "Só anúncios novos", "coalesce(l.review_count, 0) = 0");
  } else if (filter.onlyWithoutReviews === false) {
    add("onlyWithoutReviews", "Exclui anúncios sem avaliação", "coalesce(l.review_count, 0) > 0");
  }

  // 7.3 Texto ------------------------------------------------------------
  addTextPredicates(filter, builder, add);

  // 7.4 Amenidades -------------------------------------------------------
  if (filter.amenities) {
    add("amenities", "Amenidades", buildAmenityExpr(filter.amenities, builder));
  }

  // 7.5 Estrutura --------------------------------------------------------
  if (filter.roomTypes?.length) {
    add("roomTypes", "Tipo de acomodação", `l.room_type = any(${builder.param(filter.roomTypes)}::text[])`);
  }
  if (filter.excludeRoomTypes?.length) {
    add(
      "excludeRoomTypes",
      "Tipos excluídos",
      `(l.room_type is null or l.room_type <> all(${builder.param(filter.excludeRoomTypes)}::text[]))`,
    );
  }
  compare("bedroomsMin", "Quartos mínimos", "l.bedrooms", ">=", filter.bedroomsMin);
  compare("bedroomsMax", "Quartos máximos", "l.bedrooms", "<=", filter.bedroomsMax);
  compare("bedsMin", "Camas mínimas", "l.beds", ">=", filter.bedsMin);
  compare("bathroomsMin", "Banheiros mínimos", "l.bathrooms", ">=", filter.bathroomsMin);
  compare("personCapacityMin", "Capacidade mínima", "l.person_capacity", ">=", filter.personCapacityMin);
  compare("pictureCountMin", "Mínimo de fotos", "l.picture_count", ">=", filter.pictureCountMin);

  if (filter.requirePrivateBathroom) {
    add(
      "requirePrivateBathroom",
      "Banheiro privativo",
      "coalesce(l.is_shared_bathroom, false) = false and not (l.amenities @> array['shared_bathroom']::text[])",
    );
  }

  if (filter.bedsPerGuestMin !== null && filter.bedsPerGuestMin !== undefined) {
    add(
      "bedsPerGuestMin",
      "Razão camas/hóspedes",
      `l.beds::numeric / nullif(l.person_capacity, 0) >= ${builder.param(filter.bedsPerGuestMin)}`,
    );
  }

  // 7.6 Anfitrião --------------------------------------------------------
  if (filter.superhostOnly) {
    add("superhostOnly", "Só Superhost", "l.host_is_superhost = true");
  }
  if (filter.hostSinceBefore) {
    add(
      "hostSinceBefore",
      "Tempo mínimo de cadastro",
      `l.host_since <= ${builder.param(filter.hostSinceBefore)}::date`,
    );
  }
  compare("hostListingCountMax", "Máx. anúncios do anfitrião", "l.host_listing_count", "<=", filter.hostListingCountMax);
  compare("hostListingCountMin", "Mín. anúncios do anfitrião", "l.host_listing_count", ">=", filter.hostListingCountMin);
  compare("hostResponseRateMin", "Taxa de resposta mínima", "l.host_response_rate", ">=", filter.hostResponseRateMin);

  // 7.7 Reserva e políticas ---------------------------------------------
  if (filter.instantBookableOnly) {
    add("instantBookableOnly", "Reserva instantânea", "l.instant_bookable = true");
  }
  if (filter.cancellationAtMost) {
    const allowed = allowedPolicies(filter.cancellationAtMost);
    add(
      "cancellationAtMost",
      "Política de cancelamento",
      `(l.cancellation_policy is null or l.cancellation_policy = any(${builder.param(allowed)}::text[]))`,
    );
  }
  compare("minNightsAtMost", "Estadia mínima aceitável", "l.min_nights", "<=", filter.minNightsAtMost);
  compare("maxNightsAtLeast", "Estadia máxima aceitável", "l.max_nights", ">=", filter.maxNightsAtLeast);

  // 7.8 Geografia --------------------------------------------------------
  addGeoPredicates(filter, builder, searchParam, add);

  // 7.9 Triagem ----------------------------------------------------------
  if (filter.excludeRejected) {
    add("excludeRejected", "Exclui descartados", "coalesce(v.verdict, '') <> 'rejected'");
  }
  if (filter.onlyShortlist) {
    add("onlyShortlist", "Só favoritos", "v.verdict = 'shortlist'");
  }
  if (filter.hideSeen) {
    add("hideSeen", "Oculta já vistos", "v.verdict is null");
  }

  return predicates;
}

/**
 * Filtros textuais. Cada termo vira um `plainto_tsquery` próprio — nunca uma
 * string de tsquery montada por concatenação, que seria injetável e quebraria
 * com qualquer pontuação digitada pelo usuário.
 */
function addTextPredicates(
  filter: FilterDefinition,
  builder: SqlBuilder,
  add: (key: string, label: string, sql: string) => void,
) {
  const reviewMatch = (terms: string[]) =>
    `exists (
      select 1 from reviews r, unnest(${builder.param(terms)}::text[]) as termo
      where r.listing_id = l.id and r.tsv @@ plainto_tsquery('portuguese', termo)
    )`;

  const columnMatch = (column: string, terms: string[]) =>
    `exists (
      select 1 from unnest(${builder.param(terms)}::text[]) as termo
      where to_tsvector('portuguese', coalesce(l.${column}, ''))
            @@ plainto_tsquery('portuguese', termo)
    )`;

  if (filter.reviewsExcludeTerms?.length) {
    add(
      "reviewsExcludeTerms",
      "Avaliações sem os termos",
      `not ${reviewMatch(filter.reviewsExcludeTerms)}`,
    );
  }
  if (filter.reviewsIncludeTerms?.length) {
    add("reviewsIncludeTerms", "Avaliações com os termos", reviewMatch(filter.reviewsIncludeTerms));
  }
  if (filter.descriptionIncludeTerms?.length) {
    add("descriptionIncludeTerms", "Descrição contém", columnMatch("description", filter.descriptionIncludeTerms));
  }
  if (filter.descriptionExcludeTerms?.length) {
    add(
      "descriptionExcludeTerms",
      "Descrição não contém",
      `not ${columnMatch("description", filter.descriptionExcludeTerms)}`,
    );
  }
  if (filter.houseRulesIncludeTerms?.length) {
    add("houseRulesIncludeTerms", "Regras contêm", columnMatch("house_rules", filter.houseRulesIncludeTerms));
  }
  if (filter.houseRulesExcludeTerms?.length) {
    add(
      "houseRulesExcludeTerms",
      "Regras não contêm",
      `not ${columnMatch("house_rules", filter.houseRulesExcludeTerms)}`,
    );
  }
}

/**
 * Geografia. A origem ofusca a localização exata em até ~150 m, então todo
 * raio leva uma margem de tolerância somada — o padrão é 200 m, configurável.
 */
function addGeoPredicates(
  filter: FilterDefinition,
  builder: SqlBuilder,
  searchParam: string,
  add: (key: string, label: string, sql: string) => void,
) {
  const anchors = filter.anchors;
  if (anchors) {
    const tolerance = builder.param(anchors.toleranceM ?? 200);
    const ids = anchors.ids?.length ? builder.param(anchors.ids) : null;
    const scope = `a.search_id = ${searchParam} and a.max_distance_m is not null${
      ids ? ` and a.id = any(${ids}::uuid[])` : ""
    }`;
    const within = `extensions.ST_DWithin(l.geo, a.geo, a.max_distance_m + ${tolerance})`;

    if (anchors.mode === "or") {
      add(
        "anchors",
        "Perto de qualquer âncora",
        `exists (select 1 from anchors a where ${scope} and ${within})`,
      );
    } else {
      // "Perto de todas" = nenhuma âncora com restrição fica longe. Escrito
      // como NOT EXISTS para que uma busca sem âncoras não zere o resultado.
      add(
        "anchors",
        "Perto de todas as âncoras",
        `not exists (select 1 from anchors a where ${scope} and not ${within})`,
      );
    }
  }

  if (filter.excludeRadius?.length) {
    const clauses = filter.excludeRadius.map((exclusion) => {
      const lng = builder.param(exclusion.lng);
      const lat = builder.param(exclusion.lat);
      const distance = builder.param(exclusion.minDistanceM);
      return `not extensions.ST_DWithin(l.geo, extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}, ${lat}), 4326)::extensions.geography, ${distance})`;
    });
    add("excludeRadius", "Longe dos pontos excluídos", clauses.join(" and "));
  }

  if (filter.polygon?.length) {
    const ring = [...filter.polygon, filter.polygon[0]];
    const wkt = `POLYGON((${ring.map((point) => `${point.lng} ${point.lat}`).join(",")}))`;
    add(
      "polygon",
      "Dentro do polígono",
      `extensions.ST_Within(l.geo::extensions.geometry, extensions.ST_GeomFromText(${builder.param(wkt)}, 4326))`,
    );
  }
}

/** Árvore booleana de amenidades (§7.4) traduzida para predicados `@>`. */
export function buildAmenityExpr(expr: AmenityExpr, builder: SqlBuilder): string {
  switch (expr.op) {
    case "has":
      return `l.amenities @> array[${builder.param(expr.amenity)}]::text[]`;
    case "and":
      return `(${expr.children.map((child) => buildAmenityExpr(child, builder)).join(" and ")})`;
    case "or":
      return `(${expr.children.map((child) => buildAmenityExpr(child, builder)).join(" or ")})`;
    case "not":
      return `(not ${buildAmenityExpr(expr.child, builder)})`;
  }
}

/** "No máximo tão restritiva quanto X" sobre a escala ordenada de §7.7. */
export function allowedPolicies(atMost: CancellationPolicy): string[] {
  const ceiling = CANCELLATION_RANK[atMost];
  return Object.entries(CANCELLATION_RANK)
    .filter(([, rank]) => rank <= ceiling)
    .map(([policy]) => policy);
}
