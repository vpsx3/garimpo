import type { RawListing, RawPriceQuote } from "@/lib/providers/types";

/**
 * Normalização de preço — a razão de existir do produto.
 *
 * A diária anunciada mente por omissão: um imóvel de R$ 200/noite com R$ 600
 * de limpeza é péssimo para 2 noites e ótimo para 14. `effective_nightly`
 * dilui *todas* as taxas pelas noites da estadia e é a única métrica de preço
 * que permite comparar duas opções.
 */

export type PriceBreakdown = {
  nights: number;
  guests: number;
  grossNightly: number | null;
  cleaningFee: number | null;
  serviceFee: number | null;
  taxes: number | null;
  discountTotal: number | null;
  totalPrice: number;
  effectiveNightly: number;
  pricePerPerson: number;
  currency: string;
  isAvailable: boolean;
  /** "quote" quando veio da cotação real; "search" quando é estimativa. */
  source: "search" | "quote";
};

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

/** Descontos podem chegar positivos ou negativos; aqui são sempre negativos. */
function asDiscount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value === 0) return 0;
  return -Math.abs(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Preço a partir da cotação real (Etapa C do pipeline).
 *
 * Quando a origem informa o total, ele manda: é o número que o usuário vai
 * pagar. Só quando falta é que somamos os componentes — e aí o resultado é
 * uma reconstrução, não uma leitura.
 */
export function breakdownFromQuote(
  quote: RawPriceQuote,
  options: { guests: number; nights?: number; currency?: string },
): PriceBreakdown | null {
  const nights = Math.max(1, options.nights ?? quote.nights ?? 1);
  const guests = Math.max(1, options.guests);

  const grossNightly = quote.grossNightly ?? null;
  const cleaningFee = quote.cleaningFee ?? null;
  const serviceFee = quote.serviceFee ?? null;
  const taxes = quote.taxes ?? null;
  const discountTotal = asDiscount(quote.discountTotal);

  const reconstructed =
    (grossNightly ?? 0) * nights +
    (cleaningFee ?? 0) +
    (serviceFee ?? 0) +
    (taxes ?? 0) +
    (discountTotal ?? 0);

  const totalPrice =
    quote.totalPrice !== null && quote.totalPrice !== undefined && quote.totalPrice > 0
      ? quote.totalPrice
      : reconstructed;

  if (!Number.isFinite(totalPrice) || totalPrice <= 0) return null;

  return {
    nights,
    guests,
    grossNightly,
    cleaningFee,
    serviceFee,
    taxes,
    discountTotal,
    totalPrice: round2(totalPrice),
    effectiveNightly: round2(totalPrice / nights),
    pricePerPerson: round2(totalPrice / guests),
    currency: quote.currency ?? options.currency ?? "BRL",
    isAvailable: quote.isAvailable ?? true,
    source: "quote",
  };
}

/**
 * Preço a partir da listagem ampla (Etapa A do pipeline).
 *
 * É uma estimativa: a busca não expõe taxa de limpeza. Registramos assim
 * mesmo, porque é o que permite aplicar o filtro barato de preço antes de
 * gastar uma chamada de cotação por anúncio — e porque a diferença entre esta
 * estimativa e a cotação real é, ela própria, informação útil.
 */
export function breakdownFromListing(
  listing: RawListing,
  options: { guests: number; nights: number; currency?: string },
): PriceBreakdown | null {
  const nights = Math.max(1, options.nights);
  const guests = Math.max(1, options.guests);
  const grossNightly = listing.price?.grossNightly ?? null;
  const announcedTotal = listing.price?.totalPrice ?? null;

  const totalPrice =
    announcedTotal && announcedTotal > 0
      ? announcedTotal
      : grossNightly && grossNightly > 0
        ? grossNightly * nights
        : null;

  if (totalPrice === null) return null;

  return {
    nights,
    guests,
    grossNightly,
    cleaningFee: null,
    serviceFee: null,
    taxes: null,
    discountTotal: null,
    totalPrice: round2(totalPrice),
    effectiveNightly: round2(totalPrice / nights),
    pricePerPerson: round2(totalPrice / guests),
    currency: listing.price?.currency ?? options.currency ?? "BRL",
    isAvailable: true,
    source: "search",
  };
}

/**
 * Quanto o anúncio mente: razão entre o que se paga por noite de verdade e a
 * diária anunciada. 1,0 é honesto; 1,4 significa 40% escondido em taxas.
 */
export function priceHonesty(breakdown: PriceBreakdown): number | null {
  if (!breakdown.grossNightly || breakdown.grossNightly <= 0) return null;
  return round2(breakdown.effectiveNightly / breakdown.grossNightly);
}

/** Quanto do total é taxa de limpeza. Expõe quem esconde preço na limpeza. */
export function cleaningRatio(breakdown: PriceBreakdown): number | null {
  if (!breakdown.cleaningFee || breakdown.totalPrice <= 0) return null;
  return round2(breakdown.cleaningFee / breakdown.totalPrice);
}
