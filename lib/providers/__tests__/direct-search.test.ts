import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  collectSearchResults,
  decodeListingId,
  normalizeSearchResult,
  parsePriceBreakdown,
  parseRating,
  parseStructuredContent,
} from "../direct/search";
import { locationSlug, pageCursor } from "../direct/page";
import { breakdownFromListing } from "@/lib/ingest/price";

/**
 * Fixture gravada da página real de resultados do Airbnb, não inventada.
 * É contra ela que o adapter precisa continuar funcionando.
 */
const state = JSON.parse(
  readFileSync(
    join(__dirname, "..", "__fixtures__", "direct-search-page.json"),
    "utf8",
  ),
);

describe("leitura do estado embutido na página", () => {
  it("acha os resultados da busca", () => {
    const results = collectSearchResults(state);
    expect(results.length).toBe(6);
    expect(results[0].__typename).toBe("StaySearchResult");
  });

  it("acha os resultados mesmo se o caminho mudar", () => {
    const movido = { qualquer: { coisa: state.niobeClientData } };
    expect(collectSearchResults(movido).length).toBe(6);
  });
});

describe("normalização do anúncio real", () => {
  const results = collectSearchResults(state);
  const listings = results
    .map(normalizeSearchResult)
    .filter((listing): listing is NonNullable<typeof listing> => listing !== null);

  it("normaliza todos os anúncios da página", () => {
    expect(listings).toHaveLength(6);
  });

  it("extrai id, título e link", () => {
    const first = listings[0];
    expect(first.externalId).toMatch(/^\d+$/);
    expect(first.title).toBeTruthy();
    expect(first.url).toBe(`https://www.airbnb.com.br/rooms/${first.externalId}`);
  });

  it("extrai coordenadas plausíveis para Lisboa", () => {
    for (const listing of listings) {
      expect(listing.lat).toBeGreaterThan(38);
      expect(listing.lat).toBeLessThan(39);
      expect(listing.lng).toBeGreaterThan(-10);
      expect(listing.lng).toBeLessThan(-8);
    }
  });

  it("extrai nota e volume de avaliações", () => {
    const comNota = listings.filter((listing) => listing.ratingOverall !== null);
    expect(comNota.length).toBeGreaterThan(0);
    for (const listing of comNota) {
      expect(listing.ratingOverall).toBeGreaterThan(3);
      expect(listing.ratingOverall).toBeLessThanOrEqual(5);
      expect(listing.reviewCount).toBeGreaterThan(0);
    }
  });

  it("traz o preço total já com impostos", () => {
    for (const listing of listings) {
      expect(listing.price?.totalPrice).toBeGreaterThan(0);
      expect(listing.price?.grossNightly).toBeGreaterThan(0);
      // O total precisa ser maior que a soma nua das diárias: a diferença
      // são os impostos, e é exatamente o que a busca nativa esconde.
      expect(listing.price!.totalPrice!).toBeGreaterThan(listing.price!.grossNightly!);
    }
  });

  it("a diária efetiva sai direto da busca, sem cotação por anúncio", () => {
    const listing = listings[0];
    const breakdown = breakdownFromListing(listing, { guests: 4, nights: 5 });
    expect(breakdown).not.toBeNull();
    expect(breakdown!.effectiveNightly).toBeGreaterThan(breakdown!.grossNightly!);
  });

  it("extrai fotos", () => {
    expect(listings[0].pictureUrls!.length).toBeGreaterThan(0);
    expect(listings[0].pictureUrls![0]).toContain("muscache.com");
  });
});

describe("parsers de campo", () => {
  it("lê nota no formato da origem", () => {
    expect(parseRating("4,82 (513)")).toEqual({ rating: 4.82, reviewCount: 513 });
    expect(parseRating("4,9 (40)")).toEqual({ rating: 4.9, reviewCount: 40 });
  });

  it("trata anúncio novo como zero avaliações, não como nota ausente", () => {
    expect(parseRating("Novo")).toEqual({ rating: null, reviewCount: 0 });
  });

  it("decodifica o id base64 da origem", () => {
    expect(decodeListingId("RGVtYW5kU3RheUxpc3Rpbmc6MzE4MzgwOA==")).toBe("3183808");
    expect(decodeListingId("12345")).toBe("12345");
    expect(decodeListingId(null)).toBeNull();
  });

  it("lê a decomposição de preço rotulada", () => {
    const results = collectSearchResults(state);
    const price = parsePriceBreakdown(results[0]);
    expect(price.nights).toBe(5);
    expect(price.nightly).toBeGreaterThan(0);
    expect(price.total).toBeGreaterThan(0);
    expect(price.taxes).toBeGreaterThan(0);
  });

  it("lê quartos e camas do conteúdo estruturado", () => {
    const results = collectSearchResults(state);
    const structured = parseStructuredContent(results[0]);
    expect(structured.bedrooms).toBeGreaterThan(0);
    expect(structured.beds).toBeGreaterThan(0);
  });
});

describe("construção de URL", () => {
  it("monta o slug de localização como a origem escreve", () => {
    expect(locationSlug("Lisboa, Portugal")).toBe("Lisboa--Portugal");
    expect(locationSlug("Rio de Janeiro")).toBe("Rio-de-Janeiro");
  });

  it("remove acento — sem isso a origem devolve outro lugar", () => {
    // Verificado ao vivo: "São Paulo--Brasil" cai no hemisfério norte e
    // "Florianópolis--Brasil" cai no Rio Grande do Sul. Sem acento, ambos
    // resolvem certo. Como isso atinge quase toda cidade brasileira, é o
    // teste que protege o produto inteiro no Brasil.
    expect(locationSlug("Estado de São Paulo, Brasil")).toBe(
      "Estado-de-Sao-Paulo--Brasil",
    );
    expect(locationSlug("Florianópolis, Brasil")).toBe("Florianopolis--Brasil");
    expect(locationSlug("Brasília")).toBe("Brasilia");
  });

  it("descarta pontuação que quebraria o caminho da URL", () => {
    expect(locationSlug("São Paulo (SP), Brasil")).toBe("Sao-Paulo-SP--Brasil");
  });

  it("gera o cursor de paginação no formato esperado", () => {
    const cursor = pageCursor(18);
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    expect(decoded).toEqual({ section_offset: 0, items_offset: 18, version: 1 });
  });
});
