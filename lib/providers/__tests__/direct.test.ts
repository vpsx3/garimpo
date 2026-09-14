import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  extractApiKey,
  extractOperationHashes,
  pickScriptUrls,
} from "../direct/bootstrap";
import {
  collectListingNodes,
  collectReviewNodes,
  decodeListingId,
  extractPriceBreakdown,
} from "../direct/shape";
import { encodeListingId } from "../direct";
import { normalizeListing, normalizePriceQuote } from "../apify/normalize";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");
}

describe("bootstrap do adapter direct", () => {
  const html = fixture("airbnb-homepage.html");

  it("extrai a chave da API do bundle, sem hardcode", () => {
    expect(extractApiKey(html)).toBe("d306zoyjsyarp7ifhu67rjxn52tv0t20");
  });

  it("devolve null quando a chave some", () => {
    expect(extractApiKey("<html><body>nada aqui</body></html>")).toBeNull();
  });

  it("extrai os sha256Hash das operações persistidas", () => {
    const hashes = extractOperationHashes(html);
    expect(hashes.StaysSearch).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
    expect(hashes.StaysPdpSections).toHaveLength(64);
  });

  it("escolhe bundles plausíveis para varrer", () => {
    const urls = pickScriptUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("main.abc123.js");
  });
});

describe("varredura de forma do payload GraphQL", () => {
  const payload = JSON.parse(fixture("direct-search.json"));

  it("acha o anúncio sem depender de caminho fixo", () => {
    const nodes = collectListingNodes(payload);
    expect(nodes).toHaveLength(1);

    const listing = normalizeListing(nodes[0]);
    expect(listing!.externalId).toBe("1112223");
    expect(listing!.title).toBe("Loft com vista para o Tejo");
    expect(listing!.roomType).toBe("entire_home");
    expect(listing!.ratingOverall).toBe(4.92);
    expect(listing!.reviewCount).toBe(128);
    expect(listing!.lat).toBeCloseTo(38.7071, 4);
    expect(listing!.lng).toBeCloseTo(-9.1355, 4);
    expect(listing!.pictureCount).toBe(2);
  });

  it("acha o mesmo anúncio se ele for movido na árvore", () => {
    const moved = { alguma: { coisa: { nova: payload.data } } };
    expect(collectListingNodes(moved)).toHaveLength(1);
  });

  it("não confunde nó qualquer com anúncio", () => {
    expect(collectListingNodes({ data: { id: "123", foo: "bar" } })).toHaveLength(0);
  });
});

describe("decomposição de preço da PDP", () => {
  it("reconhece cada linha pelo rótulo e monta a cotação", () => {
    const payload = JSON.parse(fixture("direct-pdp-price.json"));
    const breakdown = extractPriceBreakdown(payload);
    const quote = normalizePriceQuote(breakdown, "1112223", 5);

    expect(quote.cleaningFee).toBe(320);
    expect(quote.serviceFee).toBe(412);
    expect(quote.taxes).toBe(98);
    expect(quote.discountTotal).toBe(-130);
    expect(quote.totalPrice).toBe(3300);
    expect(quote.nights).toBe(5);
  });
});

describe("ids de anúncio", () => {
  it("decodifica o formato base64 da origem", () => {
    expect(decodeListingId("U3RheUxpc3Rpbmc6MTExMjIyMw==")).toBe("1112223");
  });

  it("deixa id numérico como está", () => {
    expect(decodeListingId("12345")).toBe("12345");
    expect(decodeListingId(12345)).toBe("12345");
  });

  it("codifica de volta no formato esperado pela origem", () => {
    expect(decodeListingId(encodeListingId("1112223"))).toBe("1112223");
  });
});

describe("coleta de avaliações", () => {
  it("acha avaliações por formato, não por caminho", () => {
    const payload = {
      data: {
        x: {
          reviews: [
            { comments: "Ótimo lugar", localizedDate: "maio de 2025", rating: 5 },
            { comments: "Ruim", reviewer: { name: "A" }, rating: 2 },
            { comments: "sem sinais suficientes" },
          ],
        },
      },
    };
    expect(collectReviewNodes(payload)).toHaveLength(2);
  });
});
