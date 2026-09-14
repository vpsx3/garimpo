import type { Sql } from "postgres";
import { getSql } from "@/lib/db/client";
import { createProvider, type FallbackProvider } from "@/lib/providers";
import {
  ListingUnavailableError,
  ProviderStaleError,
  ProviderTransientError,
} from "@/lib/providers/types";
import type { FilterDefinition } from "@/lib/filters/types";
import { buildCountQuery } from "@/lib/filters/build";
import { breakdownFromQuote, nightsBetween } from "./price";
import { insertReviews, insertSnapshot, updateListingDetail } from "./persist";
import { loadSearch } from "./run";

/**
 * Etapas C, D e E do pipeline.
 *
 * Estas chamadas são caras e rate-limitadas: uma por anúncio, por etapa. Por
 * isso rodam **depois** dos filtros baratos, sobre o subconjunto que
 * sobreviveu — tipicamente 15–40 anúncios em vez de 300. Um pipeline que
 * enriquece tudo antes de filtrar não escala e queima cota.
 */

const DETAIL_MAX_AGE_DAYS = 7;
const REVIEWS_MAX_AGE_DAYS = 7;
const QUOTE_MAX_AGE_HOURS = 24;
const REVIEW_LIMIT = 50;

export type EnrichResult = {
  searchId: string;
  candidates: number;
  quotes: { fetched: number; skipped: number; failed: number };
  details: { fetched: number; skipped: number; failed: number };
  reviews: { fetched: number; skipped: number; failed: number; inserted: number };
  unavailable: number;
  fellBackTo: string | null;
  durationMs: number;
};

type Candidate = {
  id: string;
  external_id: string;
  detail_fetched_at: string | null;
  reviews_fetched_at: string | null;
  last_quote_at: string | null;
};

/**
 * Seleciona os anúncios a enriquecer aplicando os filtros baratos primeiro.
 *
 * Reaproveitar o query builder aqui não é elegância: é o que garante que o
 * conjunto enriquecido seja exatamente o conjunto que o usuário está vendo.
 */
async function selectCandidates(
  sql: Sql,
  searchId: string,
  filter: FilterDefinition,
  limit: number,
): Promise<Candidate[]> {
  const { text, params } = buildCountQuery(searchId, filter);

  // Mesmo CTE e mesmos predicados da contagem, trocando o count pelas colunas
  // de controle de cache.
  const selection = text.replace(
    "select count(*)::int as total",
    `select
      l.id,
      l.external_id,
      l.detail_fetched_at,
      l.reviews_fetched_at,
      (select max(q.captured_at) from listing_snapshots q
        where q.listing_id = l.id and q.source = 'quote') as last_quote_at`,
  );

  return sql.unsafe<Candidate[]>(
    `${selection} order by s.effective_nightly nulls last limit ${Number(limit)}`,
    params as never[],
  );
}

function isStale(value: string | null, maxAgeMs: number): boolean {
  if (!value) return true;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > maxAgeMs;
}

const DAY_MS = 86_400_000;

export async function enrichSearch(
  searchId: string,
  options: {
    filter?: FilterDefinition;
    limit?: number;
    steps?: { quote?: boolean; detail?: boolean; reviews?: boolean };
    force?: boolean;
  } = {},
): Promise<EnrichResult> {
  const startedAt = Date.now();
  const sql = await getSql();

  const search = await loadSearch(sql, searchId);
  if (!search) throw new Error(`Busca ${searchId} não encontrada.`);

  const steps = {
    quote: options.steps?.quote ?? true,
    detail: options.steps?.detail ?? true,
    reviews: options.steps?.reviews ?? true,
  };

  const candidates = await selectCandidates(
    sql,
    searchId,
    options.filter ?? {},
    options.limit ?? 40,
  );

  const provider = createProvider();
  const nights = nightsBetween(search.check_in, search.check_out);

  const result: EnrichResult = {
    searchId,
    candidates: candidates.length,
    quotes: { fetched: 0, skipped: 0, failed: 0 },
    details: { fetched: 0, skipped: 0, failed: 0 },
    reviews: { fetched: 0, skipped: 0, failed: 0, inserted: 0 },
    unavailable: 0,
    fellBackTo: null,
    durationMs: 0,
  };

  // Sequencial de propósito: o limitador global já serializa as chamadas, e
  // paralelizar aqui só serviria para chegar mais rápido a um bloqueio de IP.
  for (const candidate of candidates) {
    if (steps.quote) {
      await fetchQuote(sql, provider, candidate, {
        searchId,
        checkIn: search.check_in,
        checkOut: search.check_out,
        guests: search.guests,
        nights,
        currency: search.currency,
        force: options.force ?? false,
        result,
      });
    }

    if (steps.detail) {
      if (!options.force && !isStale(candidate.detail_fetched_at, DETAIL_MAX_AGE_DAYS * DAY_MS)) {
        result.details.skipped++;
      } else {
        try {
          const detail = await provider.getListingDetail(candidate.external_id);
          await updateListingDetail(sql, candidate.id, detail);
          result.details.fetched++;
        } catch (error) {
          if (rethrowIfFatal(error)) throw error;
          result.details.failed++;
        }
      }
    }

    if (steps.reviews) {
      if (!options.force && !isStale(candidate.reviews_fetched_at, REVIEWS_MAX_AGE_DAYS * DAY_MS)) {
        result.reviews.skipped++;
      } else {
        try {
          const reviews = await provider.getReviews(candidate.external_id, REVIEW_LIMIT);
          result.reviews.inserted += await insertReviews(sql, candidate.id, reviews);
          result.reviews.fetched++;
        } catch (error) {
          if (rethrowIfFatal(error)) throw error;
          result.reviews.failed++;
        }
      }
    }
  }

  result.fellBackTo = provider.lastFallbackReason;
  result.durationMs = Date.now() - startedAt;
  return result;
}

async function fetchQuote(
  sql: Sql,
  provider: FallbackProvider,
  candidate: Candidate,
  context: {
    searchId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    nights: number;
    currency: string;
    force: boolean;
    result: EnrichResult;
  },
): Promise<void> {
  // Preço nunca é cacheado além de 24h: é o dado mais perecível do sistema.
  if (
    !context.force &&
    !isStale(candidate.last_quote_at, QUOTE_MAX_AGE_HOURS * 3_600_000)
  ) {
    context.result.quotes.skipped++;
    return;
  }

  try {
    const quote = await provider.getPriceQuote(candidate.external_id, {
      checkIn: context.checkIn,
      checkOut: context.checkOut,
      guests: context.guests,
    });

    const breakdown = breakdownFromQuote(quote, {
      guests: context.guests,
      nights: context.nights,
      currency: context.currency,
    });

    if (!breakdown) {
      context.result.quotes.failed++;
      return;
    }

    await insertSnapshot(sql, {
      listingId: candidate.id,
      searchId: context.searchId,
      breakdown,
      raw: quote.raw,
    });
    context.result.quotes.fetched++;
  } catch (error) {
    if (error instanceof ListingUnavailableError) {
      // O anúncio sumiu ou não aceita estas datas. Registrar como
      // indisponível é informação, não falha.
      await sql`
        insert into listing_snapshots (
          listing_id, search_id, nights, total_price, effective_nightly,
          currency, is_available, source
        ) values (
          ${candidate.id}, ${context.searchId}, ${context.nights}, 0, 0,
          ${context.currency}, false, 'quote'
        )
      `;
      context.result.unavailable++;
      return;
    }
    if (rethrowIfFatal(error)) throw error;
    context.result.quotes.failed++;
  }
}

/**
 * Obsolescência do provider interrompe o lote inteiro: insistir anúncio a
 * anúncio contra uma origem que mudou só gasta cota e chama atenção.
 * Falha isolada de um anúncio, não.
 */
function rethrowIfFatal(error: unknown): boolean {
  if (error instanceof ProviderStaleError) return true;
  if (error instanceof ProviderTransientError) return false;
  return false;
}
