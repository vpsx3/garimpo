import { z } from "zod";

/**
 * Contrato da camada de ingestão.
 *
 * Esta é a única parte frágil do sistema: é ela que conversa com a origem.
 * Tudo o mais opera sobre o cache local. Quando a origem muda, só um adapter
 * precisa ser reescrito.
 */

export type DateRange = {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
};

export type SearchQuery = DateRange & {
  locationQuery: string;
  guests: number;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  pets?: number | null;
  /** Teto de diária bruta passado à origem. Único filtro de preço remoto. */
  maxGrossNightly?: number | null;
  currency?: string;
  /** Quantos resultados no máximo trazer da origem. */
  limit?: number;
};

/**
 * Todo campo é opcional de propósito: nada vindo da origem é garantido.
 * Os schemas usam `.passthrough()` para que campos desconhecidos sobrevivam
 * até o `raw`.
 */
export const rawListingSchema = z
  .object({
    externalId: z.string(),
    url: z.string().nullish(),
    title: z.string().nullish(),
    propertyType: z.string().nullish(),
    roomType: z.string().nullish(),
    personCapacity: z.number().nullish(),
    bedrooms: z.number().nullish(),
    beds: z.number().nullish(),
    bathrooms: z.number().nullish(),
    isSharedBathroom: z.boolean().nullish(),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
    pictureCount: z.number().nullish(),
    pictureUrls: z.array(z.string()).nullish(),
    ratingOverall: z.number().nullish(),
    reviewCount: z.number().nullish(),
    isSuperhost: z.boolean().nullish(),
    hostExternalId: z.string().nullish(),
    hostName: z.string().nullish(),
    amenities: z.array(z.string()).nullish(),
    instantBookable: z.boolean().nullish(),
    minNights: z.number().nullish(),
    maxNights: z.number().nullish(),
    price: z
      .object({
        grossNightly: z.number().nullish(),
        totalPrice: z.number().nullish(),
        taxes: z.number().nullish(),
        cleaningFee: z.number().nullish(),
        nights: z.number().nullish(),
        currency: z.string().nullish(),
        /**
         * Verdadeiro quando a origem exibiu o preço no modo regulado
         * ("Total:"), em que limpeza e serviço já estão amortizados na diária
         * e o total é o que se paga. Nesse caso o preço da busca não é
         * estimativa — dispensa a cotação por anúncio.
         */
        isRegulatedTotal: z.boolean().nullish(),
      })
      .loose()
      .nullish(),
    raw: z.unknown(),
  })
  .loose();

export type RawListing = z.infer<typeof rawListingSchema>;

export const rawListingDetailSchema = rawListingSchema
  .extend({
    description: z.string().nullish(),
    houseRules: z.string().nullish(),
    spaceText: z.string().nullish(),
    neighborhoodText: z.string().nullish(),
    cancellationPolicy: z.string().nullish(),
    ratingCleanliness: z.number().nullish(),
    ratingAccuracy: z.number().nullish(),
    ratingCheckin: z.number().nullish(),
    ratingCommunication: z.number().nullish(),
    ratingLocation: z.number().nullish(),
    ratingValue: z.number().nullish(),
    firstReviewAt: z.string().nullish(),
    lastReviewAt: z.string().nullish(),
    hostSince: z.string().nullish(),
    hostListingCount: z.number().nullish(),
    hostResponseRate: z.number().nullish(),
    hostResponseTime: z.string().nullish(),
  })
  .loose();

export type RawListingDetail = z.infer<typeof rawListingDetailSchema>;

export const rawPriceQuoteSchema = z
  .object({
    externalId: z.string(),
    nights: z.number(),
    grossNightly: z.number().nullish(),
    cleaningFee: z.number().nullish(),
    serviceFee: z.number().nullish(),
    taxes: z.number().nullish(),
    discountTotal: z.number().nullish(),
    totalPrice: z.number().nullish(),
    currency: z.string().nullish(),
    isAvailable: z.boolean().nullish(),
    raw: z.unknown(),
  })
  .loose();

export type RawPriceQuote = z.infer<typeof rawPriceQuoteSchema>;

export const rawReviewSchema = z
  .object({
    externalId: z.string().nullish(),
    createdAt: z.string().nullish(),
    rating: z.number().nullish(),
    language: z.string().nullish(),
    comment: z.string().nullish(),
  })
  .loose();

export type RawReview = z.infer<typeof rawReviewSchema>;

export interface SearchProvider {
  name: string;
  searchStays(q: SearchQuery): Promise<RawListing[]>;
  getListingDetail(listingId: string): Promise<RawListingDetail>;
  getPriceQuote(
    listingId: string,
    q: DateRange & { guests: number },
  ): Promise<RawPriceQuote>;
  getReviews(listingId: string, limit: number): Promise<RawReview[]>;
}

/**
 * Lançado quando o adapter `direct` perde a chave da API ou os hashes de
 * operação persistida. Não é bug: é o modo de falha esperado. Quem captura
 * cai para o adapter `apify`.
 */
export class ProviderStaleError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderStaleError";
  }
}

/** Falha transitória da origem (429, 5xx, timeout). Vale a pena repetir. */
export class ProviderTransientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderTransientError";
  }
}

/** O anúncio sumiu ou está indisponível para as datas pedidas. */
export class ListingUnavailableError extends Error {
  constructor(readonly listingId: string, message?: string) {
    super(message ?? `Anúncio ${listingId} indisponível.`);
    this.name = "ListingUnavailableError";
  }
}
