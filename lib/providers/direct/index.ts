import {
  ListingUnavailableError,
  ProviderStaleError,
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
import { normalizeListingDetail, normalizeReview } from "@/lib/providers/apify/normalize";
import { collectReviewNodes, extractPriceBreakdown } from "./shape";
import { fetchDeferredState, locationSlug, pageCursor } from "./page";
import { collectSearchResults, normalizeSearchResult } from "./search";
import { extractPdpDetail } from "./pdp";
import { asNumber } from "@/lib/providers/extract";

const ORIGIN = "https://www.airbnb.com.br";
const PAGE_SIZE = 18;

/**
 * Adapter que lê as próprias páginas do Airbnb.
 *
 * A primeira versão falava com o GraphQL interno e quebrou no primeiro contato
 * real: a API só aceita operações persistidas, cuja `sha256Hash` não aparece
 * no HTML da home e rotaciona a cada deploy deles. Sem hash, 400.
 *
 * Esta versão pede a mesma página que o navegador pede e lê o JSON que ela já
 * carrega em `data-deferred-state-0` — a resposta do GraphQL, inteira. Some a
 * chave de API, some o hash, some a persisted query: três pontos de quebra a
 * menos, e de brinde o preço já vem decomposto com impostos e total.
 */
export class DirectProvider implements SearchProvider {
  readonly name = "direct";

  async searchStays(q: SearchQuery): Promise<RawListing[]> {
    const alvo = Math.min(q.limit ?? 200, 300);
    const listings: RawListing[] = [];
    const vistos = new Set<string>();

    for (let offset = 0; offset < alvo; offset += PAGE_SIZE) {
      const state = await fetchDeferredState(this.searchUrl(q, offset));
      const results = collectSearchResults(state);

      if (results.length === 0) {
        if (offset === 0) {
          throw new ProviderStaleError(
            "A página de busca não trouxe nenhum resultado reconhecível; " +
              "a forma do payload mudou.",
          );
        }
        break; // acabaram as páginas
      }

      for (const result of results) {
        const normalized = normalizeSearchResult(result);
        if (!normalized || vistos.has(normalized.externalId)) continue;
        const parsed = rawListingSchema.safeParse(normalized);
        if (!parsed.success) continue;
        vistos.add(parsed.data.externalId);
        listings.push(parsed.data);
      }

      if (results.length < PAGE_SIZE) break;
    }

    return listings.slice(0, alvo);
  }

  async getListingDetail(listingId: string): Promise<RawListingDetail> {
    const state = await fetchDeferredState(this.roomUrl(listingId));
    const pdp = extractPdpDetail(state);

    if (!pdp.description && pdp.amenities.length === 0) {
      // Detalhe vazio é falha silenciosa: o anúncio sumiu, ou a página mudou
      // de forma. Devolver um objeto oco faria o filtro de palavra-chave
      // descartar o anúncio como se ele não tivesse a amenidade.
      throw new ListingUnavailableError(
        listingId,
        `A página do anúncio ${listingId} não trouxe descrição nem amenidades.`,
      );
    }

    const detail = normalizeListingDetail({
      id: listingId,
      description: pdp.description,
      houseRules: pdp.houseRules,
      amenities: pdp.amenities,
      personCapacity: pdp.personCapacity,
      bedrooms: pdp.bedrooms,
      beds: pdp.beds,
      bathrooms: pdp.bathrooms,
      rating: pdp.ratingOverall,
      reviewsCount: pdp.reviewCount,
      ratingCleanliness: pdp.ratingCleanliness,
      ratingAccuracy: pdp.ratingAccuracy,
      ratingCheckin: pdp.ratingCheckin,
      ratingCommunication: pdp.ratingCommunication,
      ratingLocation: pdp.ratingLocation,
      ratingValue: pdp.ratingValue,
      hostName: pdp.hostName,
      isSuperhost: pdp.hostIsSuperhost,
      hostListingCount: pdp.hostListingCount,
      hostResponseRate: pdp.hostResponseRate,
      lat: pdp.lat,
      lng: pdp.lng,
    });

    if (!detail) throw new ListingUnavailableError(listingId);
    return rawListingDetailSchema.parse(detail);
  }

  async getPriceQuote(
    listingId: string,
    q: DateRange & { guests: number },
  ): Promise<RawPriceQuote> {
    const nights = nightsBetween(q.checkIn, q.checkOut);
    const state = await fetchDeferredState(this.roomUrl(listingId, q));
    const breakdown = extractPriceBreakdown(state);

    return rawPriceQuoteSchema.parse({
      externalId: listingId,
      nights,
      grossNightly: asNumber(breakdown.nightlyRate),
      cleaningFee: asNumber(breakdown.cleaningFee),
      serviceFee: asNumber(breakdown.serviceFee),
      taxes: asNumber(breakdown.taxes),
      discountTotal: asNumber(breakdown.discount),
      totalPrice: asNumber(breakdown.totalPrice),
      currency: typeof breakdown.currency === "string" ? breakdown.currency : "BRL",
      isAvailable: true,
      raw: breakdown,
    });
  }

  async getReviews(listingId: string, limit: number): Promise<RawReview[]> {
    const state = await fetchDeferredState(this.roomUrl(listingId));
    const reviews: RawReview[] = [];

    for (const node of collectReviewNodes(state).slice(0, limit)) {
      const normalized = normalizeReview(node);
      if (!normalized) continue;
      const parsed = rawReviewSchema.safeParse(normalized);
      if (parsed.success) reviews.push(parsed.data);
    }
    return reviews;
  }

  private searchUrl(q: SearchQuery, offset: number): string {
    const url = new URL(`${ORIGIN}/s/${locationSlug(q.locationQuery)}/homes`);
    url.searchParams.set("checkin", q.checkIn);
    url.searchParams.set("checkout", q.checkOut);
    url.searchParams.set("adults", String(q.adults ?? q.guests));
    if (q.children) url.searchParams.set("children", String(q.children));
    if (q.infants) url.searchParams.set("infants", String(q.infants));
    if (q.pets) url.searchParams.set("pets", String(q.pets));
    if (q.maxGrossNightly) {
      url.searchParams.set("price_max", String(Math.round(q.maxGrossNightly)));
    }
    // A origem mostra o preço já com taxas quando pedimos explicitamente —
    // é o que torna a diária efetiva disponível já na busca.
    url.searchParams.set("price_filter_input_type", "2");
    url.searchParams.set("search_type", "filter_change");
    if (offset > 0) url.searchParams.set("cursor", pageCursor(offset));
    return url.toString();
  }

  private roomUrl(listingId: string, range?: DateRange): string {
    const url = new URL(`${ORIGIN}/rooms/${listingId}`);
    if (range) {
      url.searchParams.set("check_in", range.checkIn);
      url.searchParams.set("check_out", range.checkOut);
    }
    return url.toString();
  }
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

export { encodeListingId } from "./shape-compat";
