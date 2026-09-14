import { describe, expect, it, vi } from "vitest";
import { FallbackProvider } from "../index";
import {
  ProviderStaleError,
  ProviderTransientError,
  type RawListing,
  type SearchProvider,
  type SearchQuery,
} from "../types";

const query: SearchQuery = {
  locationQuery: "Lisboa, Portugal",
  checkIn: "2026-11-10",
  checkOut: "2026-11-15",
  guests: 4,
};

function stub(name: string, overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name,
    searchStays: vi.fn(async () => [] as RawListing[]),
    getListingDetail: vi.fn(),
    getPriceQuote: vi.fn(),
    getReviews: vi.fn(async () => []),
    ...overrides,
  } as SearchProvider;
}

describe("FallbackProvider", () => {
  it("usa o primário quando ele funciona", async () => {
    const primary = stub("direct", {
      searchStays: vi.fn(async () => [{ externalId: "1", raw: {} }] as RawListing[]),
    });
    const secondary = stub("apify");
    const provider = new FallbackProvider(primary, secondary);

    await expect(provider.searchStays(query)).resolves.toHaveLength(1);
    expect(secondary.searchStays).not.toHaveBeenCalled();
    expect(provider.lastFallbackReason).toBeNull();
  });

  it("cai para a Apify em ProviderStaleError, sem erro visível", async () => {
    const primary = stub("direct", {
      searchStays: vi.fn(async () => {
        throw new ProviderStaleError("sha256Hash rotacionou");
      }),
    });
    const secondary = stub("apify", {
      searchStays: vi.fn(async () => [{ externalId: "2", raw: {} }] as RawListing[]),
    });
    const provider = new FallbackProvider(primary, secondary);

    const result = await provider.searchStays(query);
    expect(result[0].externalId).toBe("2");
    expect(secondary.searchStays).toHaveBeenCalledOnce();
    expect(provider.lastFallbackReason).toContain("sha256Hash rotacionou");
  });

  it("não mascara falha transitória: essa é para repetir, não para cair", async () => {
    const primary = stub("direct", {
      searchStays: vi.fn(async () => {
        throw new ProviderTransientError("429", 429);
      }),
    });
    const secondary = stub("apify");
    const provider = new FallbackProvider(primary, secondary);

    await expect(provider.searchStays(query)).rejects.toThrow(ProviderTransientError);
    expect(secondary.searchStays).not.toHaveBeenCalled();
  });

  it("propaga a obsolescência quando não há para onde cair", async () => {
    const primary = stub("direct", {
      searchStays: vi.fn(async () => {
        throw new ProviderStaleError("obsoleto");
      }),
    });
    const provider = new FallbackProvider(primary, null);
    await expect(provider.searchStays(query)).rejects.toThrow(ProviderStaleError);
  });

  it("cai em qualquer operação do contrato, não só na busca", async () => {
    const primary = stub("direct", {
      getReviews: vi.fn(async () => {
        throw new ProviderStaleError("payload de reviews mudou");
      }),
    });
    const secondary = stub("apify", {
      getReviews: vi.fn(async () => [{ comment: "ok" }]),
    });
    const provider = new FallbackProvider(primary, secondary);

    await expect(provider.getReviews("1", 50)).resolves.toHaveLength(1);
    expect(provider.lastFallbackReason).toContain("getReviews");
  });
});
