import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  canonicalCancellationPolicy,
  canonicalRoomType,
  normalizeListing,
  normalizePriceQuote,
  normalizeReview,
} from "../apify/normalize";
import { rawListingSchema } from "../types";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8"),
  );
}

describe("normalizeListing sobre payload da Apify", () => {
  const items = fixture("apify-search.json") as unknown[];

  it("normaliza o item completo", () => {
    const listing = normalizeListing(items[0]);
    expect(listing).not.toBeNull();
    expect(listing!.externalId).toBe("12345678");
    expect(listing!.title).toBe("Apartamento reformado no Príncipe Real");
    expect(listing!.roomType).toBe("entire_home");
    expect(listing!.beds).toBe(3);
    expect(listing!.bathrooms).toBe(1.5);
    expect(listing!.isSharedBathroom).toBe(true);
    expect(listing!.lat).toBeCloseTo(38.7169, 4);
    expect(listing!.ratingOverall).toBe(4.87);
    expect(listing!.reviewCount).toBe(214);
    expect(listing!.amenities).toEqual([
      "Ar-condicionado",
      "Wi-Fi",
      "Máquina de lavar",
    ]);
    expect(listing!.price?.grossNightly).toBe(412.9);
    expect(listing!.price?.totalPrice).toBe(2064.5);
  });

  it("aceita apelidos de campo diferentes no mesmo dataset", () => {
    const listing = normalizeListing(items[1]);
    expect(listing!.externalId).toBe("87654321");
    expect(listing!.roomType).toBe("private_room");
    // avgRating veio em escala 0–100.
    expect(listing!.ratingOverall).toBe(4.8);
    expect(listing!.reviewCount).toBe(31);
    expect(listing!.lat).toBeCloseTo(38.7223, 4);
  });

  it("descarta item sem id em vez de inventar um", () => {
    expect(normalizeListing(items[2])).toBeNull();
  });

  it("o resultado passa pelo schema Zod", () => {
    const listing = normalizeListing(items[0]);
    expect(rawListingSchema.safeParse(listing).success).toBe(true);
  });

  it("sobrevive a payload vazio ou de tipo errado", () => {
    expect(normalizeListing(null)).toBeNull();
    expect(normalizeListing("string solta")).toBeNull();
    expect(normalizeListing({})).toBeNull();
  });
});

describe("normalizeReview", () => {
  const items = fixture("apify-reviews.json") as unknown[];

  it("lê comentário, data e nota", () => {
    const review = normalizeReview(items[0]);
    expect(review!.externalId).toBe("r-1");
    expect(review!.createdAt).toBe("2025-03-14");
    expect(review!.rating).toBe(5);
  });

  it("aceita data por extenso", () => {
    const review = normalizeReview(items[1]);
    expect(review!.createdAt).toBe("2025-01-01");
    expect(review!.comment).toContain("barulho de obra");
  });

  it("descarta avaliação sem texto", () => {
    expect(normalizeReview(items[2])).toBeNull();
  });
});

describe("normalizePriceQuote", () => {
  it("mantém cada componente separado", () => {
    const quote = normalizePriceQuote(
      {
        nightlyRate: "R$ 520,00",
        cleaningFee: "R$ 320,00",
        serviceFee: "R$ 412,00",
        taxes: "R$ 98,00",
        discount: "-R$ 130,00",
        totalPrice: "R$ 3.300,00",
        currency: "BRL",
      },
      "12345678",
      5,
    );
    expect(quote.grossNightly).toBe(520);
    expect(quote.cleaningFee).toBe(320);
    expect(quote.serviceFee).toBe(412);
    expect(quote.taxes).toBe(98);
    expect(quote.discountTotal).toBe(-130);
    expect(quote.totalPrice).toBe(3300);
    expect(quote.nights).toBe(5);
  });
});

describe("vocabulário canônico", () => {
  it("normaliza tipo de quarto entre idiomas", () => {
    expect(canonicalRoomType("Entire home/apt")).toBe("entire_home");
    expect(canonicalRoomType("Casa/apto inteiro")).toBe("entire_home");
    expect(canonicalRoomType("Quarto privativo")).toBe("private_room");
    expect(canonicalRoomType("Shared room")).toBe("shared_room");
    expect(canonicalRoomType("Hotel room")).toBe("hotel_room");
    expect(canonicalRoomType("qualquer coisa")).toBeNull();
  });

  it("normaliza política de cancelamento", () => {
    expect(canonicalCancellationPolicy("Flexible")).toBe("flexible");
    expect(canonicalCancellationPolicy("Rigorosa")).toBe("strict");
    expect(canonicalCancellationPolicy("Super rigorosa 60 dias")).toBe("super_strict");
  });
});
