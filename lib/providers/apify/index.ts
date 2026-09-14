import { env, requireEnv } from "@/lib/env";
import { fetchJson } from "@/lib/providers/http";
import { sleep } from "@/lib/providers/rate-limit";
import {
  ListingUnavailableError,
  ProviderTransientError,
  rawListingDetailSchema,
  rawListingSchema,
  rawPriceQuoteSchema,
  rawReviewSchema,
  type DateRange,
  type RawListing,
  type RawListingDetail,
  type RawPriceQuote,
  type RawReview,
  type SearchProvider,
  type SearchQuery,
} from "@/lib/providers/types";
import {
  normalizeListing,
  normalizeListingDetail,
  normalizePriceQuote,
  normalizeReview,
} from "./normalize";

const API_BASE = "https://api.apify.com/v2";
const LIMITER = "apify";

/**
 * Adapter que delega a coleta a um actor da Apify.
 *
 * Custa por resultado, mas transfere a manutenção da fragilidade para o
 * fornecedor — é o caminho que mantém o projeto vivo sem babysitting.
 *
 * A forma do input varia entre actors. `APIFY_INPUT_TEMPLATE` (JSON) permite
 * ajustar sem mexer no código; o que montamos aqui é o denominador comum.
 */
export class ApifyProvider implements SearchProvider {
  readonly name = "apify";

  private get token(): string {
    return requireEnv("APIFY_TOKEN");
  }

  private get actorId(): string {
    return requireEnv("APIFY_ACTOR_ID").replace("/", "~");
  }

  static isConfigured(): boolean {
    return Boolean(env("APIFY_TOKEN") && env("APIFY_ACTOR_ID"));
  }

  async searchStays(q: SearchQuery): Promise<RawListing[]> {
    const items = await this.runActor({
      ...this.inputTemplate(),
      locationQuery: q.locationQuery,
      location: q.locationQuery,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      adults: q.adults ?? q.guests,
      children: q.children ?? 0,
      infants: q.infants ?? 0,
      pets: q.pets ?? 0,
      currency: q.currency ?? "BRL",
      priceMax: q.maxGrossNightly ?? undefined,
      maxListings: q.limit ?? 300,
      maxItems: q.limit ?? 300,
    });

    const listings: RawListing[] = [];
    for (const item of items) {
      const normalized = normalizeListing(item);
      if (!normalized) continue;
      const parsed = rawListingSchema.safeParse(normalized);
      if (parsed.success) listings.push(parsed.data);
    }
    return listings;
  }

  async getListingDetail(listingId: string): Promise<RawListingDetail> {
    const items = await this.runActor({
      ...this.inputTemplate(),
      startUrls: [{ url: listingUrl(listingId) }],
      listingUrls: [listingUrl(listingId)],
      maxItems: 1,
    });
    const detail = items.map(normalizeListingDetail).find(Boolean);
    if (!detail) {
      throw new ListingUnavailableError(
        listingId,
        `Actor não retornou detalhe para o anúncio ${listingId}.`,
      );
    }
    return rawListingDetailSchema.parse(detail);
  }

  async getPriceQuote(
    listingId: string,
    q: DateRange & { guests: number },
  ): Promise<RawPriceQuote> {
    const nights = nightsBetween(q.checkIn, q.checkOut);
    const items = await this.runActor({
      ...this.inputTemplate(),
      startUrls: [{ url: listingUrl(listingId, q) }],
      listingUrls: [listingUrl(listingId, q)],
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      adults: q.guests,
      maxItems: 1,
    });
    const first = items[0];
    if (!first) {
      throw new ListingUnavailableError(listingId);
    }
    return rawPriceQuoteSchema.parse(
      normalizePriceQuote(first, listingId, nights),
    );
  }

  async getReviews(listingId: string, limit: number): Promise<RawReview[]> {
    const items = await this.runActor({
      ...this.inputTemplate(),
      startUrls: [{ url: listingUrl(listingId) }],
      listingUrls: [listingUrl(listingId)],
      includeReviews: true,
      maxReviews: limit,
      maxItems: 1,
    });

    // O actor pode devolver as avaliações aninhadas no item do anúncio ou
    // como itens soltos do dataset. Aceitamos as duas formas.
    const candidates: unknown[] = [];
    for (const item of items) {
      const nested = (item as Record<string, unknown>)?.reviews;
      if (Array.isArray(nested)) candidates.push(...nested);
      else candidates.push(item);
    }

    const reviews: RawReview[] = [];
    for (const candidate of candidates.slice(0, limit)) {
      const normalized = normalizeReview(candidate);
      if (!normalized) continue;
      const parsed = rawReviewSchema.safeParse(normalized);
      if (parsed.success) reviews.push(parsed.data);
    }
    return reviews;
  }

  private inputTemplate(): Record<string, unknown> {
    const template = env("APIFY_INPUT_TEMPLATE");
    if (!template) return {};
    try {
      const parsed: unknown = JSON.parse(template);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  /**
   * Buscas interativas usam a chamada síncrona com teto de 120s. Se o actor
   * estourar esse tempo, a Apify responde 408 e caímos para o modo assíncrono
   * com polling do runId — mais lento, porém sem teto prático.
   */
  private async runActor(input: Record<string, unknown>): Promise<unknown[]> {
    const cleaned = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    try {
      return await fetchJson<unknown[]>(
        `${API_BASE}/acts/${this.actorId}/run-sync-get-dataset-items?token=${this.token}&timeout=120`,
        {
          limiter: LIMITER,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cleaned),
          timeoutMs: 130_000,
          attempts: 2,
        },
      );
    } catch (error) {
      if (
        error instanceof ProviderTransientError &&
        (error.status === 408 || error.status === undefined)
      ) {
        return this.runActorAsync(cleaned);
      }
      throw error;
    }
  }

  private async runActorAsync(input: Record<string, unknown>): Promise<unknown[]> {
    const started = await fetchJson<{
      data?: { id?: string; defaultDatasetId?: string };
    }>(`${API_BASE}/acts/${this.actorId}/runs?token=${this.token}`, {
      limiter: LIMITER,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const runId = started.data?.id;
    if (!runId) throw new ProviderTransientError("Apify não devolveu runId.");

    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await sleep(5_000);
      const run = await fetchJson<{
        data?: { status?: string; defaultDatasetId?: string };
      }>(`${API_BASE}/actor-runs/${runId}?token=${this.token}`, {
        limiter: LIMITER,
      });
      const status = run.data?.status;
      if (status === "SUCCEEDED") {
        const datasetId = run.data?.defaultDatasetId;
        if (!datasetId) return [];
        return fetchJson<unknown[]>(
          `${API_BASE}/datasets/${datasetId}/items?token=${this.token}&clean=true`,
          { limiter: LIMITER },
        );
      }
      if (status && !["READY", "RUNNING"].includes(status)) {
        throw new ProviderTransientError(`Run da Apify terminou como ${status}.`);
      }
    }
    throw new ProviderTransientError("Run da Apify excedeu 10 minutos.");
  }
}

function listingUrl(listingId: string, range?: DateRange): string {
  const url = new URL(`https://www.airbnb.com.br/rooms/${listingId}`);
  if (range) {
    url.searchParams.set("check_in", range.checkIn);
    url.searchParams.set("check_out", range.checkOut);
  }
  return url.toString();
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
