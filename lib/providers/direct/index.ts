import { limitedFetch } from "@/lib/providers/http";
import {
  ListingUnavailableError,
  ProviderStaleError,
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
} from "@/lib/providers/apify/normalize";
import { nightsBetween } from "@/lib/providers/apify";
import { getBootstrap, invalidateBootstrap } from "./bootstrap";
import { collectListingNodes, collectReviewNodes, extractPriceBreakdown } from "./shape";

const ORIGIN = "https://www.airbnb.com.br";
const LIMITER = "direct";

/**
 * Adapter que fala direto com o GraphQL interno da origem.
 *
 * Gratuito e rápido, e vai quebrar periodicamente — isso é esperado, não é
 * bug (§13). Quando quebra, lança `ProviderStaleError` e quem chama cai para
 * a Apify.
 *
 * O payload do GraphQL é uma árvore profunda e instável. Em vez de navegar por
 * caminhos fixos, varremos a árvore atrás de nós que *parecem* anúncios
 * (`shape.ts`) e normalizamos com os mesmos extratores defensivos do outro
 * adapter.
 */
export class DirectProvider implements SearchProvider {
  readonly name = "direct";

  async searchStays(q: SearchQuery): Promise<RawListing[]> {
    const variables = {
      request: {
        metadataOnly: false,
        version: "1.8.3",
        itemsPerGrid: Math.min(q.limit ?? 300, 50),
        placeId: null,
        query: q.locationQuery,
        checkin: q.checkIn,
        checkout: q.checkOut,
        adults: q.adults ?? q.guests,
        children: q.children ?? 0,
        infants: q.infants ?? 0,
        pets: q.pets ?? 0,
        priceMax: q.maxGrossNightly ?? null,
        currency: q.currency ?? "BRL",
        source: "structured_search_input_header",
        searchType: "filter_change",
      },
    };

    const payload = await this.call("StaysSearch", variables);
    const listings: RawListing[] = [];
    const seen = new Set<string>();

    for (const node of collectListingNodes(payload)) {
      const normalized = normalizeListing(node);
      if (!normalized || seen.has(normalized.externalId)) continue;
      const parsed = rawListingSchema.safeParse(normalized);
      if (!parsed.success) continue;
      seen.add(parsed.data.externalId);
      listings.push(parsed.data);
    }

    if (listings.length === 0) {
      // Resposta 200 sem nenhum anúncio reconhecível significa que a forma do
      // payload mudou — exatamente o caso de obsolescência.
      throw new ProviderStaleError(
        "StaysSearch respondeu sem nenhum anúncio reconhecível; a forma do payload mudou.",
      );
    }

    return listings;
  }

  async getListingDetail(listingId: string): Promise<RawListingDetail> {
    const payload = await this.call("StaysPdpSections", {
      id: encodeListingId(listingId),
      pdpSectionsRequest: {
        adults: "1",
        layouts: ["SIDEBAR", "SINGLE_COLUMN"],
        pdpTypeOverride: null,
      },
    });

    const node = collectListingNodes(payload)[0] ?? payload;
    const detail = normalizeListingDetail({ id: listingId, ...asRecord(node) });
    if (!detail) throw new ListingUnavailableError(listingId);
    return rawListingDetailSchema.parse(detail);
  }

  async getPriceQuote(
    listingId: string,
    q: DateRange & { guests: number },
  ): Promise<RawPriceQuote> {
    const nights = nightsBetween(q.checkIn, q.checkOut);
    const payload = await this.call("StaysPdpSections", {
      id: encodeListingId(listingId),
      pdpSectionsRequest: {
        adults: String(q.guests),
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        layouts: ["SIDEBAR", "SINGLE_COLUMN"],
      },
    });

    const breakdown = extractPriceBreakdown(payload);
    return rawPriceQuoteSchema.parse(
      normalizePriceQuote(breakdown, listingId, nights),
    );
  }

  async getReviews(listingId: string, limit: number): Promise<RawReview[]> {
    const payload = await this.call("StaysPdpReviewsQuery", {
      request: {
        fieldSelector: "for_p3_translation_only",
        limit,
        listingId: encodeListingId(listingId),
        offset: "0",
      },
    });

    const reviews: RawReview[] = [];
    for (const node of collectReviewNodes(payload).slice(0, limit)) {
      const normalized = normalizeReview(node);
      if (!normalized) continue;
      const parsed = rawReviewSchema.safeParse(normalized);
      if (parsed.success) reviews.push(parsed.data);
    }
    return reviews;
  }

  /**
   * Uma chamada ao GraphQL. Tenta a persisted query quando o hash foi
   * extraído; sem hash, envia como query nomeada e deixa a origem decidir.
   * Um 400/403/404 aqui quase sempre significa hash rotacionado: refazemos o
   * bootstrap uma vez e, se insistir, declaramos obsolescência.
   */
  private async call(
    operationName: string,
    variables: Record<string, unknown>,
    retried = false,
  ): Promise<unknown> {
    const bootstrap = await getBootstrap();
    const hash = bootstrap.operationHashes[operationName];

    const url = new URL(`${ORIGIN}/api/v3/${operationName}/${hash ?? ""}`);
    url.searchParams.set("operationName", operationName);
    url.searchParams.set("locale", "pt");
    url.searchParams.set("currency", "BRL");

    const body = {
      operationName,
      variables,
      extensions: hash
        ? { persistedQuery: { version: 1, sha256Hash: hash } }
        : undefined,
    };

    const response = await limitedFetch(url.toString(), {
      limiter: LIMITER,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airbnb-api-key": bootstrap.apiKey,
        "x-airbnb-supports-airlock-v2": "true",
        origin: ORIGIN,
        referer: `${ORIGIN}/`,
      },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
      attempts: 2,
    });

    if (response.status === 400 || response.status === 403 || response.status === 404) {
      if (!retried) {
        invalidateBootstrap();
        await getBootstrap(true);
        return this.call(operationName, variables, true);
      }
      throw new ProviderStaleError(
        `${operationName} respondeu ${response.status} mesmo após novo bootstrap; ` +
          "chave ou sha256Hash rotacionaram.",
      );
    }

    if (!response.ok) {
      throw new ProviderTransientError(
        `${operationName} respondeu ${response.status}.`,
        response.status,
      );
    }

    const payload = (await response.json()) as { errors?: unknown[] };
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new ProviderStaleError(
        `${operationName} devolveu erros de GraphQL: ${JSON.stringify(
          payload.errors,
        ).slice(0, 300)}`,
      );
    }
    return payload;
  }
}

/** A origem usa ids base64 no formato `StayListing:12345`. */
export function encodeListingId(listingId: string): string {
  if (/^[A-Za-z0-9+/=]{12,}$/.test(listingId) && !/^\d+$/.test(listingId)) {
    return listingId; // já veio codificado
  }
  return Buffer.from(`StayListing:${listingId}`, "utf8").toString("base64");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
