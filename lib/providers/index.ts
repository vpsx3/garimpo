import { activeProviderName, type ProviderName } from "@/lib/env";
import { ApifyProvider } from "./apify";
import { DirectProvider } from "./direct";
import {
  ProviderStaleError,
  type DateRange,
  type RawListing,
  type RawListingDetail,
  type RawPriceQuote,
  type RawReview,
  type SearchProvider,
  type SearchQuery,
} from "./types";

export * from "./types";

/**
 * Provider com queda automática.
 *
 * O adapter `direct` vai quebrar periodicamente — é o modo de falha esperado,
 * não um bug (§13). Quando ele lança `ProviderStaleError`, a mesma chamada é
 * refeita na Apify e o usuário não vê erro nenhum. A troca é registrada para
 * que o Vini saiba que está pagando por chamada.
 */
export class FallbackProvider implements SearchProvider {
  readonly name: string;

  constructor(
    private readonly primary: SearchProvider,
    private readonly secondary: SearchProvider | null,
  ) {
    this.name = secondary ? `${primary.name}+${secondary.name}` : primary.name;
  }

  /** Preenchido quando a queda acontece; a rota de ingestão reporta isso. */
  lastFallbackReason: string | null = null;

  private async attempt<T>(
    operation: string,
    run: (provider: SearchProvider) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.primary);
    } catch (error) {
      if (!(error instanceof ProviderStaleError) || !this.secondary) throw error;
      this.lastFallbackReason = `${operation}: ${error.message}`;
      console.warn(
        `[providers] ${this.primary.name} obsoleto em ${operation}; ` +
          `caindo para ${this.secondary.name}. ${error.message}`,
      );
      return run(this.secondary);
    }
  }

  searchStays(q: SearchQuery): Promise<RawListing[]> {
    return this.attempt("searchStays", (provider) => provider.searchStays(q));
  }

  getListingDetail(listingId: string): Promise<RawListingDetail> {
    return this.attempt("getListingDetail", (provider) =>
      provider.getListingDetail(listingId),
    );
  }

  getPriceQuote(
    listingId: string,
    q: DateRange & { guests: number },
  ): Promise<RawPriceQuote> {
    return this.attempt("getPriceQuote", (provider) =>
      provider.getPriceQuote(listingId, q),
    );
  }

  getReviews(listingId: string, limit: number): Promise<RawReview[]> {
    return this.attempt("getReviews", (provider) =>
      provider.getReviews(listingId, limit),
    );
  }
}

export function createProvider(name: ProviderName = activeProviderName()): FallbackProvider {
  if (name === "apify") {
    // Não há para onde cair: `direct` não é mais confiável que a Apify.
    return new FallbackProvider(new ApifyProvider(), null);
  }
  const secondary = ApifyProvider.isConfigured() ? new ApifyProvider() : null;
  return new FallbackProvider(new DirectProvider(), secondary);
}

export { ApifyProvider, DirectProvider };
