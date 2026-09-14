import { AMENITY_LABELS, type AmenityKey } from "@/lib/amenities/canonical";
import {
  CANCELLATION_RANK,
  type AmenityExpr,
  type CancellationPolicy,
  type FilterDefinition,
} from "./types";

/**
 * Avaliação de `FilterDefinition` em memória.
 *
 * Substitui o query builder de SQL: sem banco, o universo de uma busca são as
 * ~50–300 linhas que a origem devolveu, e filtrar isso em JavaScript é
 * instantâneo. A `FilterDefinition` continua sendo o mesmo objeto — o que muda
 * é só onde ela é executada.
 *
 * Cada predicado é nomeado para que o estado vazio possa dizer *qual* filtro
 * zerou o resultado, como fazia o diagnóstico em SQL.
 */

export type Row = {
  externalId: string;
  title: string | null;
  url: string | null;
  roomType: string | null;
  propertyType: string | null;
  personCapacity: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  isSharedBathroom: boolean | null;
  lat: number | null;
  lng: number | null;
  pictureCount: number | null;
  pictureUrls: string[] | null;
  ratingOverall: number | null;
  reviewCount: number | null;
  isSuperhost: boolean | null;
  hostName: string | null;
  amenities: string[];
  /**
   * Rótulos de amenidade como a origem escreveu, antes da canonicalização.
   * O vocabulário canônico cobre o que é filtrável por lógica booleana, mas
   * descarta o resto — e é justamente no resto que moram "sauna", "quadra de
   * tênis" e tudo que a busca por palavra-chave precisa encontrar.
   */
  amenityLabels: string[];
  instantBookable: boolean | null;
  minNights: number | null;
  maxNights: number | null;
  // preço anunciado, sempre presente
  grossNightly: number | null;
  announcedTotal: number | null;
  currency: string;
  nights: number;
  guests: number;
  // preenchidos pelo passo 2 (cotação e enriquecimento)
  effectiveNightly: number | null;
  totalPrice: number | null;
  cleaningFee: number | null;
  serviceFee: number | null;
  taxes: number | null;
  discountTotal: number | null;
  pricePerPerson: number | null;
  isAvailable: boolean;
  priceSource: "search" | "quote";
  cleaningRatio: number | null;
  priceHonesty: number | null;
  bedsPerGuest: number | null;
  description: string | null;
  houseRules: string | null;
  ratingCleanliness: number | null;
  ratingAccuracy: number | null;
  ratingCheckin: number | null;
  ratingCommunication: number | null;
  ratingLocation: number | null;
  ratingValue: number | null;
  lastReviewAt: string | null;
  reviewsPerMonth: number | null;
  hostSince: string | null;
  hostListingCount: number | null;
  hostResponseRate: number | null;
  cancellationPolicy: string | null;
  reviews: { comment: string; createdAt: string | null; rating: number | null }[];
  anchorDistances: { anchorId: string; label: string; meters: number }[];
  minAnchorDistanceM: number | null;
  verdict: "shortlist" | "rejected" | "seen" | null;
  score?: number;
  score_breakdown?: unknown;
};

export type Anchor = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  maxDistanceM: number | null;
  weight: number;
};

type Predicate = {
  key: string;
  label: string;
  test: (row: Row) => boolean;
};

export type FilterOutcome = {
  rows: Row[];
  /** Quantas linhas cada filtro sozinho deixaria passar. */
  perFilter: { key: string; label: string; survivors: number }[];
  culprits: { key: string; label: string }[];
  base: number;
};

/**
 * Comparações com valor ausente **não** eliminam a linha.
 *
 * A origem omite campos o tempo todo, e descartar um anúncio porque ela não
 * informou o número de camas seria punir o anúncio por uma lacuna dela. A
 * exceção é quando o filtro é justamente sobre a ausência.
 */
function atLeast(value: number | null | undefined, min: number | null | undefined): boolean {
  if (min === null || min === undefined) return true;
  if (value === null || value === undefined) return true;
  return value >= min;
}

function atMost(value: number | null | undefined, max: number | null | undefined): boolean {
  if (max === null || max === undefined) return true;
  if (value === null || value === undefined) return true;
  return value <= max;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Casamento de termo. Sem Postgres não há `tsvector`, então usamos busca por
 * substring sem acento — que, para listas curtas de termos como "barulho" ou
 * "mofo", acerta mais do que o stemmer acertava: aqui "infiltracao" casa
 * "infiltração", o que no tsvector não acontecia.
 */
function matchesAnyTerm(haystack: string | null, terms: string[]): boolean {
  if (!haystack) return false;
  const text = normalizeText(haystack);
  return terms.some((term) => text.includes(normalizeText(term.trim())));
}

function reviewsMatch(row: Row, terms: string[]): boolean {
  return row.reviews.some((review) => matchesAnyTerm(review.comment, terms));
}

/**
 * Um anúncio "tem conteúdo" quando o passo 2 já trouxe descrição ou a lista de
 * amenidades. Antes disso, só o título está disponível — e um anúncio com
 * sauna cujo título não menciona sauna não pode ser reprovado por isso.
 */
export function hasContent(row: Row): boolean {
  return (
    row.description !== null ||
    row.amenityLabels.length > 0 ||
    row.houseRules !== null
  );
}

/**
 * Busca a palavra em tudo que descreve o anúncio: título, descrição, rótulos
 * de amenidade como a origem escreveu, regras da casa e os rótulos em
 * português das amenidades canônicas.
 */
export function matchesKeyword(row: Row, keyword: string): boolean {
  const needle = normalizeText(keyword.trim());
  if (!needle) return false;

  const haystacks = [
    row.title,
    row.description,
    row.houseRules,
    row.propertyType,
    ...row.amenityLabels,
    ...row.amenities.map((key) => AMENITY_LABELS[key as AmenityKey] ?? key),
  ];

  return haystacks.some(
    (value) => value !== null && value !== undefined && normalizeText(value).includes(needle),
  );
}

/** Quais palavras-chave casaram, para a UI poder mostrar o porquê. */
export function matchedKeywords(row: Row, keywords: string[]): string[] {
  return keywords.filter((keyword) => matchesKeyword(row, keyword));
}

export function evaluateAmenityExpr(expr: AmenityExpr, amenities: string[]): boolean {
  switch (expr.op) {
    case "has":
      return amenities.includes(expr.amenity);
    case "and":
      return expr.children.every((child) => evaluateAmenityExpr(child, amenities));
    case "or":
      return expr.children.some((child) => evaluateAmenityExpr(child, amenities));
    case "not":
      return !evaluateAmenityExpr(expr.child, amenities);
  }
}

export function allowedPolicies(atMostPolicy: CancellationPolicy): string[] {
  const ceiling = CANCELLATION_RANK[atMostPolicy];
  return Object.entries(CANCELLATION_RANK)
    .filter(([, rank]) => rank <= ceiling)
    .map(([policy]) => policy);
}

export function buildPredicates(filter: FilterDefinition): Predicate[] {
  const predicates: Predicate[] = [];
  const add = (key: string, label: string, test: (row: Row) => boolean) =>
    predicates.push({ key, label, test });

  const range = (
    key: string,
    label: string,
    pick: (row: Row) => number | null,
    min?: number | null,
    max?: number | null,
  ) => {
    if (min !== null && min !== undefined) {
      add(`${key}Min`, `${label} mín.`, (row) => atLeast(pick(row), min));
    }
    if (max !== null && max !== undefined) {
      add(`${key}Max`, `${label} máx.`, (row) => atMost(pick(row), max));
    }
  };

  // 7.1 Preço ------------------------------------------------------------
  range("effectiveNightly", "Diária efetiva", (r) => r.effectiveNightly,
    filter.effectiveNightlyMin, filter.effectiveNightlyMax);
  range("totalPrice", "Preço total", (r) => r.totalPrice,
    filter.totalPriceMin, filter.totalPriceMax);
  range("pricePerPerson", "Preço por pessoa", (r) => r.pricePerPerson,
    null, filter.pricePerPersonMax);
  range("cleaningFee", "Taxa de limpeza", (r) => r.cleaningFee,
    null, filter.cleaningFeeMax);
  range("cleaningRatio", "Razão limpeza/total", (r) => r.cleaningRatio,
    null, filter.cleaningRatioMax);
  range("priceHonesty", "Delta vs. anunciada", (r) => r.priceHonesty,
    null, filter.priceHonestyMax);

  if (filter.onlyWithDiscount) {
    add("onlyWithDiscount", "Só com desconto", (row) =>
      row.discountTotal !== null && Math.abs(row.discountTotal) > 0);
  }
  if (filter.onlyAvailable) {
    add("onlyAvailable", "Só disponíveis", (row) => row.isAvailable);
  }

  // 7.2 Avaliações -------------------------------------------------------
  range("ratingOverall", "Nota geral", (r) => r.ratingOverall, filter.ratingOverallMin);
  range("ratingCleanliness", "Limpeza", (r) => r.ratingCleanliness, filter.ratingCleanlinessMin);
  range("ratingLocation", "Localização", (r) => r.ratingLocation, filter.ratingLocationMin);
  range("ratingValue", "Custo-benefício", (r) => r.ratingValue, filter.ratingValueMin);
  range("ratingCheckin", "Check-in", (r) => r.ratingCheckin, filter.ratingCheckinMin);
  range("ratingCommunication", "Comunicação", (r) => r.ratingCommunication, filter.ratingCommunicationMin);
  range("ratingAccuracy", "Veracidade", (r) => r.ratingAccuracy, filter.ratingAccuracyMin);
  range("reviewCount", "Nº de avaliações", (r) => r.reviewCount, filter.reviewCountMin);
  range("reviewsPerMonth", "Avaliações/mês", (r) => r.reviewsPerMonth, filter.reviewsPerMonthMin);

  if (filter.lastReviewWithinDays) {
    const cutoff = Date.now() - filter.lastReviewWithinDays * 86_400_000;
    add("lastReviewWithinDays", "Avaliação recente", (row) => {
      if (!row.lastReviewAt) return true;
      const timestamp = Date.parse(row.lastReviewAt);
      return !Number.isFinite(timestamp) || timestamp >= cutoff;
    });
  }

  if (filter.onlyWithoutReviews === true) {
    add("onlyWithoutReviews", "Só anúncios novos", (row) => (row.reviewCount ?? 0) === 0);
  } else if (filter.onlyWithoutReviews === false) {
    add("onlyWithoutReviews", "Exclui sem avaliação", (row) => (row.reviewCount ?? 0) > 0);
  }

  // 7.3 Texto ------------------------------------------------------------
  if (filter.reviewsExcludeTerms?.length) {
    const terms = filter.reviewsExcludeTerms;
    add("reviewsExcludeTerms", "Avaliações sem os termos", (row) => !reviewsMatch(row, terms));
  }
  if (filter.reviewsIncludeTerms?.length) {
    const terms = filter.reviewsIncludeTerms;
    add("reviewsIncludeTerms", "Avaliações com os termos", (row) => reviewsMatch(row, terms));
  }
  if (filter.descriptionIncludeTerms?.length) {
    const terms = filter.descriptionIncludeTerms;
    add("descriptionIncludeTerms", "Descrição contém", (row) => matchesAnyTerm(row.description, terms));
  }
  if (filter.descriptionExcludeTerms?.length) {
    const terms = filter.descriptionExcludeTerms;
    add("descriptionExcludeTerms", "Descrição não contém", (row) => !matchesAnyTerm(row.description, terms));
  }
  if (filter.houseRulesIncludeTerms?.length) {
    const terms = filter.houseRulesIncludeTerms;
    add("houseRulesIncludeTerms", "Regras contêm", (row) => matchesAnyTerm(row.houseRules, terms));
  }
  if (filter.houseRulesExcludeTerms?.length) {
    const terms = filter.houseRulesExcludeTerms;
    add("houseRulesExcludeTerms", "Regras não contêm", (row) => !matchesAnyTerm(row.houseRules, terms));
  }

  // Busca livre por palavra-chave -----------------------------------------
  if (filter.keywords?.length) {
    const keywords = filter.keywords;
    const mode = filter.keywordsMode ?? "all";
    const label =
      mode === "any" ? "Qualquer palavra-chave" : "Todas as palavras-chave";

    add("keywords", label, (row) => {
      const found = keywords.filter((keyword) => matchesKeyword(row, keyword));
      if (mode === "any") {
        // Sem nenhum acerto, o anúncio só sobrevive se ainda não dá para
        // afirmar nada sobre ele.
        return found.length > 0 || !hasContent(row);
      }
      if (found.length === keywords.length) return true;
      // Em modo "todas", o que falta pode estar num conteúdo ainda não
      // carregado — não dá para reprovar por ausência de dado.
      return !hasContent(row);
    });
  }

  // 7.4 Amenidades -------------------------------------------------------
  if (filter.amenities) {
    const expr = filter.amenities;
    add("amenities", "Amenidades", (row) =>
      // Anúncio sem lista de amenidades ainda não foi enriquecido: não dá
      // para afirmar que ele falha na regra.
      row.amenities.length === 0 || evaluateAmenityExpr(expr, row.amenities));
  }

  // 7.5 Estrutura --------------------------------------------------------
  if (filter.roomTypes?.length) {
    const types = filter.roomTypes as string[];
    add("roomTypes", "Tipo de acomodação", (row) =>
      row.roomType === null || types.includes(row.roomType));
  }
  if (filter.excludeRoomTypes?.length) {
    const types = filter.excludeRoomTypes as string[];
    add("excludeRoomTypes", "Tipos excluídos", (row) =>
      row.roomType === null || !types.includes(row.roomType));
  }
  range("bedrooms", "Quartos", (r) => r.bedrooms, filter.bedroomsMin, filter.bedroomsMax);
  range("beds", "Camas", (r) => r.beds, filter.bedsMin);
  range("bathrooms", "Banheiros", (r) => r.bathrooms, filter.bathroomsMin);
  range("personCapacity", "Capacidade", (r) => r.personCapacity, filter.personCapacityMin);
  range("pictureCount", "Fotos", (r) => r.pictureCount, filter.pictureCountMin);
  range("bedsPerGuest", "Camas por hóspede", (r) => r.bedsPerGuest, filter.bedsPerGuestMin);

  if (filter.requirePrivateBathroom) {
    add("requirePrivateBathroom", "Banheiro privativo", (row) =>
      row.isSharedBathroom !== true && !row.amenities.includes("shared_bathroom"));
  }

  // 7.6 Anfitrião --------------------------------------------------------
  if (filter.superhostOnly) {
    add("superhostOnly", "Só Superhost", (row) => row.isSuperhost === true);
  }
  if (filter.hostSinceBefore) {
    const cutoff = Date.parse(filter.hostSinceBefore);
    add("hostSinceBefore", "Tempo de cadastro", (row) => {
      if (!row.hostSince) return true;
      const timestamp = Date.parse(row.hostSince);
      return !Number.isFinite(timestamp) || timestamp <= cutoff;
    });
  }
  range("hostListingCount", "Anúncios do anfitrião", (r) => r.hostListingCount,
    filter.hostListingCountMin, filter.hostListingCountMax);
  range("hostResponseRate", "Taxa de resposta", (r) => r.hostResponseRate, filter.hostResponseRateMin);

  // 7.7 Reserva e políticas ---------------------------------------------
  if (filter.instantBookableOnly) {
    add("instantBookableOnly", "Reserva instantânea", (row) => row.instantBookable === true);
  }
  if (filter.cancellationAtMost) {
    const allowed = allowedPolicies(filter.cancellationAtMost);
    add("cancellationAtMost", "Política de cancelamento", (row) =>
      row.cancellationPolicy === null || allowed.includes(row.cancellationPolicy));
  }
  range("minNights", "Estadia mínima", (r) => r.minNights, null, filter.minNightsAtMost);
  range("maxNights", "Estadia máxima", (r) => r.maxNights, filter.maxNightsAtLeast);

  // 7.8 Geografia --------------------------------------------------------
  if (filter.anchors) {
    const { mode, toleranceM } = filter.anchors;
    const ids = filter.anchors.ids ?? null;
    const tolerance = toleranceM ?? 200;

    add("anchors", mode === "or" ? "Perto de qualquer âncora" : "Perto de todas as âncoras",
      (row) => {
        const relevant = row.anchorDistances.filter(
          (distance) => !ids || ids.includes(distance.anchorId),
        );
        if (relevant.length === 0) return true;
        const within = relevant.map((distance) => {
          const limit = anchorLimit(row, distance.anchorId);
          return limit === null || distance.meters <= limit + tolerance;
        });
        return mode === "or" ? within.some(Boolean) : within.every(Boolean);
      });
  }

  if (filter.excludeRadius?.length) {
    const exclusions = filter.excludeRadius;
    add("excludeRadius", "Longe dos pontos excluídos", (row) => {
      if (row.lat === null || row.lng === null) return true;
      return exclusions.every(
        (exclusion) =>
          haversineMeters(row.lat!, row.lng!, exclusion.lat, exclusion.lng) >=
          exclusion.minDistanceM,
      );
    });
  }

  if (filter.polygon?.length) {
    const polygon = filter.polygon;
    add("polygon", "Dentro do polígono", (row) => {
      if (row.lat === null || row.lng === null) return true;
      return pointInPolygon(row.lat, row.lng, polygon);
    });
  }

  // 7.9 Triagem ----------------------------------------------------------
  if (filter.excludeRejected) {
    add("excludeRejected", "Exclui descartados", (row) => row.verdict !== "rejected");
  }
  if (filter.onlyShortlist) {
    add("onlyShortlist", "Só favoritos", (row) => row.verdict === "shortlist");
  }
  if (filter.hideSeen) {
    add("hideSeen", "Oculta já vistos", (row) => row.verdict === null);
  }

  return predicates;
}

/** O raio de cada âncora vem junto da distância calculada no pipeline. */
const anchorLimits = new WeakMap<Row, Map<string, number | null>>();

export function attachAnchorLimits(row: Row, limits: Map<string, number | null>): void {
  anchorLimits.set(row, limits);
}

function anchorLimit(row: Row, anchorId: string): number | null {
  return anchorLimits.get(row)?.get(anchorId) ?? null;
}

export function applyFilter(rows: Row[], filter: FilterDefinition): FilterOutcome {
  const predicates = buildPredicates(filter);

  const filtered = rows.filter((row) =>
    predicates.every((predicate) => predicate.test(row)),
  );

  // Contagem isolada por predicado: é o que permite ao estado vazio dizer
  // qual filtro zerou, em vez de só "nenhum resultado".
  const perFilter = predicates.map((predicate) => ({
    key: predicate.key,
    label: predicate.label,
    survivors: rows.filter((row) => predicate.test(row)).length,
  }));

  return {
    rows: filtered,
    perFilter,
    culprits: perFilter
      .filter((entry) => entry.survivors === 0)
      .map(({ key, label }) => ({ key, label })),
    base: rows.length,
  };
}

/** Distância sobre a esfera. Sem PostGIS, é o suficiente nessas escalas. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Ray casting. Substitui o ST_Within do polígono desenhado no mapa. */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: { lat: number; lng: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.lat > lat !== b.lat > lat &&
      lng < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}
