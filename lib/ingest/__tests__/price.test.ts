import { describe, expect, it } from "vitest";
import {
  breakdownFromListing,
  breakdownFromQuote,
  cleaningRatio,
  nightsBetween,
  priceHonesty,
} from "../price";
import type { RawListing, RawPriceQuote } from "@/lib/providers/types";

const quote: RawPriceQuote = {
  externalId: "1",
  nights: 5,
  grossNightly: 520,
  cleaningFee: 320,
  serviceFee: 412,
  taxes: 98,
  discountTotal: 130,
  totalPrice: 3300,
  currency: "BRL",
  isAvailable: true,
  raw: {},
};

describe("breakdownFromQuote", () => {
  it("dilui todas as taxas pelas noites da estadia", () => {
    const result = breakdownFromQuote(quote, { guests: 4 })!;
    expect(result.totalPrice).toBe(3300);
    expect(result.effectiveNightly).toBe(660);
    expect(result.pricePerPerson).toBe(825);
    expect(result.source).toBe("quote");
  });

  it("prefere o total informado à soma dos componentes", () => {
    // A soma daria 520*5 + 320 + 412 + 98 - 130 = 3300, mas o teste vale
    // quando a origem informa um total que não fecha com as partes.
    const result = breakdownFromQuote({ ...quote, totalPrice: 3500 }, { guests: 2 })!;
    expect(result.totalPrice).toBe(3500);
    expect(result.effectiveNightly).toBe(700);
  });

  it("reconstrói o total quando a origem não informa", () => {
    const result = breakdownFromQuote(
      { ...quote, totalPrice: null },
      { guests: 4 },
    )!;
    expect(result.totalPrice).toBe(3300);
  });

  it("trata desconto como abatimento, venha positivo ou negativo", () => {
    const positivo = breakdownFromQuote(
      { ...quote, totalPrice: null, discountTotal: 130 },
      { guests: 4 },
    )!;
    const negativo = breakdownFromQuote(
      { ...quote, totalPrice: null, discountTotal: -130 },
      { guests: 4 },
    )!;
    expect(positivo.totalPrice).toBe(negativo.totalPrice);
    expect(positivo.discountTotal).toBe(-130);
  });

  it("recusa cotação sem preço aproveitável", () => {
    expect(
      breakdownFromQuote(
        {
          externalId: "1",
          nights: 3,
          grossNightly: null,
          cleaningFee: null,
          serviceFee: null,
          taxes: null,
          discountTotal: null,
          totalPrice: null,
          currency: null,
          isAvailable: true,
          raw: {},
        },
        { guests: 2 },
      ),
    ).toBeNull();
  });
});

describe("a estadia curta é onde a taxa de limpeza dói", () => {
  const fee = { ...quote, totalPrice: null, cleaningFee: 600, serviceFee: 0, taxes: 0, discountTotal: 0, grossNightly: 200 };

  it("2 noites: a limpeza domina a diária efetiva", () => {
    const result = breakdownFromQuote({ ...fee, nights: 2 }, { guests: 2, nights: 2 })!;
    expect(result.totalPrice).toBe(1000);
    expect(result.effectiveNightly).toBe(500);
    expect(priceHonesty(result)).toBe(2.5);
  });

  it("14 noites: a mesma limpeza vira ruído", () => {
    const result = breakdownFromQuote({ ...fee, nights: 14 }, { guests: 2, nights: 14 })!;
    expect(result.effectiveNightly).toBeCloseTo(242.86, 2);
    expect(priceHonesty(result)).toBe(1.21);
  });
});

describe("breakdownFromListing", () => {
  const listing: RawListing = {
    externalId: "1",
    price: { grossNightly: 412.9, totalPrice: 2064.5, currency: "BRL" },
    raw: {},
  };

  it("usa o total anunciado quando existe", () => {
    const result = breakdownFromListing(listing, { guests: 2, nights: 5 })!;
    expect(result.totalPrice).toBe(2064.5);
    expect(result.effectiveNightly).toBe(412.9);
    expect(result.source).toBe("search");
  });

  it("multiplica a diária quando o total falta", () => {
    const result = breakdownFromListing(
      { ...listing, price: { grossNightly: 200, totalPrice: null, currency: "BRL" } },
      { guests: 2, nights: 5 },
    )!;
    expect(result.totalPrice).toBe(1000);
  });

  it("não inventa preço quando não há nenhum", () => {
    expect(
      breakdownFromListing({ externalId: "1", raw: {} }, { guests: 2, nights: 5 }),
    ).toBeNull();
  });

  it("deixa as taxas nulas: a busca não as expõe", () => {
    const result = breakdownFromListing(listing, { guests: 2, nights: 5 })!;
    expect(result.cleaningFee).toBeNull();
    expect(cleaningRatio(result)).toBeNull();
  });
});

describe("nightsBetween", () => {
  it("conta as noites da estadia", () => {
    expect(nightsBetween("2026-11-10", "2026-11-15")).toBe(5);
  });

  it("nunca devolve zero", () => {
    expect(nightsBetween("2026-11-10", "2026-11-10")).toBe(1);
    expect(nightsBetween("lixo", "outro lixo")).toBe(1);
  });
});

describe("cleaningRatio", () => {
  it("expõe quem esconde preço na limpeza", () => {
    const result = breakdownFromQuote(quote, { guests: 4 })!;
    expect(cleaningRatio(result)).toBeCloseTo(0.1, 2);
  });
});
