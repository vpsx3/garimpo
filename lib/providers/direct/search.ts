import { asCoordinate, asNumber, firstDefined } from "@/lib/providers/extract";
import type { RawListing } from "@/lib/providers/types";
import { findGraphqlPayloads } from "./page";

/**
 * Normalização dos resultados de busca tal como a página os entrega.
 *
 * A forma real é bem mais rica do que o adapter supunha: cada resultado já
 * traz a decomposição do preço — diária, impostos e total — o que permite
 * calcular a diária efetiva sem gastar uma chamada de cotação por anúncio.
 */

type SearchResult = Record<string, unknown>;

export function collectSearchResults(state: unknown): SearchResult[] {
  const found: SearchResult[] = [];

  for (const payload of findGraphqlPayloads(state)) {
    const results = firstDefined(payload, [
      "data.presentation.staysSearch.results.searchResults",
      "data.presentation.explore.sections.searchResults",
      "data.presentation.staysSearch.results.sectionConfiguration.searchResults",
    ]);
    if (Array.isArray(results)) {
      for (const item of results) {
        if (item && typeof item === "object") found.push(item as SearchResult);
      }
    }
  }

  // Fallback por formato: se o caminho mudar, ainda reconhecemos o nó pelo
  // seu __typename.
  if (found.length === 0) {
    const visit = (node: unknown, depth = 0) => {
      if (depth > 12 || node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item, depth + 1);
        return;
      }
      const record = node as Record<string, unknown>;
      if (record.__typename === "StaySearchResult") found.push(record);
      for (const value of Object.values(record)) visit(value, depth + 1);
    };
    visit(state);
  }

  return found;
}

export function normalizeSearchResult(result: SearchResult): RawListing | null {
  const listing = (result.demandStayListing ?? {}) as Record<string, unknown>;
  const externalId = decodeListingId(listing.id);
  if (!externalId) return null;

  const rating = parseRating(result.avgRatingLocalized);
  const price = parsePriceBreakdown(result);
  const structured = parseStructuredContent(result);

  const name =
    asText(
      firstDefined(listing, [
        "description.name.localizedStringWithTranslationPreference",
      ]),
    ) ??
    asText(firstDefined(result, ["nameLocalized.localizedStringWithTranslationPreference"])) ??
    asText(result.subtitle);

  const pictures = Array.isArray(result.contextualPictures)
    ? (result.contextualPictures as Record<string, unknown>[])
        .map((picture) => asText(picture?.picture))
        .filter((url): url is string => Boolean(url))
    : [];

  const badges = Array.isArray(result.badges)
    ? (result.badges as Record<string, unknown>[]).map((badge) => asText(badge?.text) ?? "")
    : [];

  return {
    externalId,
    url: `https://www.airbnb.com.br/rooms/${externalId}`,
    title: name,
    // `title` na origem é "Apartamento ⋅ Santa Maria Maior": o tipo vem antes
    // do separador, o bairro depois.
    propertyType: asText(result.title)?.split("⋅")[0]?.trim() ?? null,
    roomType: null,
    personCapacity: structured.personCapacity,
    bedrooms: structured.bedrooms,
    beds: structured.beds,
    bathrooms: structured.bathrooms,
    isSharedBathroom: structured.isSharedBathroom,
    lat: asCoordinate(firstDefined(listing, ["location.coordinate.latitude"])),
    lng: asCoordinate(firstDefined(listing, ["location.coordinate.longitude"])),
    pictureCount: pictures.length,
    pictureUrls: pictures,
    ratingOverall: rating.rating,
    reviewCount: rating.reviewCount,
    isSuperhost: badges.some((badge) => /superhost/i.test(badge)),
    hostExternalId: null,
    hostName: null,
    amenities: [],
    instantBookable: null,
    minNights: price.nights,
    maxNights: null,
    price: {
      grossNightly: price.nightly,
      totalPrice: price.total,
      taxes: price.taxes,
      cleaningFee: price.cleaning,
      nights: price.nights,
      currency: price.currency,
      isRegulatedTotal: price.isRegulatedTotal,
    },
    raw: result,
  };
}

/** `DemandStayListing:1763…` em base64 volta a ser o id numérico. */
export function decodeListingId(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || !value) return null;
  if (/^\d+$/.test(value)) return value;

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const match = decoded.match(/:(\d+)$/);
    if (match) return match[1];
  } catch {
    // Não era base64; segue.
  }
  return null;
}

/** "4,82 (513)" → nota e volume. "Novo" → anúncio sem avaliação. */
export function parseRating(value: unknown): {
  rating: number | null;
  reviewCount: number | null;
} {
  const text = asText(value);
  if (!text) return { rating: null, reviewCount: null };
  if (/^novo$/i.test(text.trim())) return { rating: null, reviewCount: 0 };

  const match = text.match(/([\d.,]+)\s*\((\d+)\)/);
  if (match) {
    return {
      rating: asNumber(match[1]),
      reviewCount: Number(match[2]),
    };
  }
  return { rating: asNumber(text), reviewCount: null };
}

export type PriceBreakdownFromSearch = {
  nights: number | null;
  nightly: number | null;
  taxes: number | null;
  cleaning: number | null;
  total: number | null;
  currency: string;
  /** A origem exibiu "Total:" com a decomposição — preço confirmado. */
  isRegulatedTotal: boolean;
};

/**
 * A origem entrega o preço como linhas rotuladas para a UI:
 * "5 noites x R$ 1.178,49", "Impostos", "Taxa de limpeza", "Total".
 * É daí que sai o total real — e, por tabela, a diária efetiva.
 */
export function parsePriceBreakdown(result: SearchResult): PriceBreakdownFromSearch {
  const breakdown: PriceBreakdownFromSearch = {
    nights: null,
    nightly: null,
    taxes: null,
    cleaning: null,
    total: null,
    currency: "BRL",
    isRegulatedTotal: false,
  };

  const groups = firstDefined(result, [
    "structuredDisplayPrice.explanationData.priceDetails",
  ]);

  if (Array.isArray(groups)) {
    for (const group of groups as Record<string, unknown>[]) {
      const items = group?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items as Record<string, unknown>[]) {
        const description = asText(item?.description) ?? "";
        const amount = asNumber(item?.priceString);
        if (amount === null) continue;

        const nightsMatch = description.match(/(\d+)\s*noites?\s*x\s*(.+)/i);
        if (nightsMatch) {
          breakdown.nights = Number(nightsMatch[1]);
          breakdown.nightly = asNumber(nightsMatch[2]);
          continue;
        }
        if (/imposto|tax/i.test(description)) breakdown.taxes = amount;
        else if (/limpeza|cleaning/i.test(description)) breakdown.cleaning = amount;
        else if (/^total$/i.test(description.trim())) breakdown.total = amount;
      }
    }
  }

  const style = firstDefined(result, ["structuredDisplayPrice.displayPriceStyle"]);
  const qualifier = firstDefined(result, ["structuredDisplayPrice.primaryLine.qualifier"]);
  breakdown.isRegulatedTotal =
    breakdown.total !== null &&
    breakdown.nights !== null &&
    (String(style ?? "").includes("REGULATED_TOTAL") ||
      /total/i.test(String(qualifier ?? "")));

  // Quando o total não vem rotulado, a linha principal costuma trazê-lo.
  if (breakdown.total === null) {
    breakdown.total = asNumber(
      firstDefined(result, [
        "structuredDisplayPrice.primaryLine.price",
        "structuredDisplayPrice.primaryLine.accessibilityLabel",
      ]),
    );
  }

  const currencyHint = asText(
    firstDefined(result, ["structuredDisplayPrice.primaryLine.price"]),
  );
  if (currencyHint?.includes("€")) breakdown.currency = "EUR";
  else if (currencyHint?.includes("$") && !currencyHint.includes("R$")) {
    breakdown.currency = "USD";
  }

  return breakdown;
}

type Structured = {
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  personCapacity: number | null;
  isSharedBathroom: boolean | null;
};

/** "2 quartos", "4 camas de solteiro", "1,5 banheiro compartilhado". */
export function parseStructuredContent(result: SearchResult): Structured {
  const out: Structured = {
    bedrooms: null,
    beds: null,
    bathrooms: null,
    personCapacity: null,
    isSharedBathroom: null,
  };

  const lines: string[] = [];
  for (const path of [
    "structuredContent.primaryLine",
    "structuredContent.secondaryLine",
    "structuredContent.mapPrimaryLine",
  ]) {
    const value = firstDefined(result, [path]);
    if (Array.isArray(value)) {
      for (const entry of value as Record<string, unknown>[]) {
        const body = asText(entry?.body);
        if (body) lines.push(body);
      }
    }
  }

  for (const line of lines) {
    const quartos = line.match(/([\d.,]+)\s*quartos?/i);
    if (quartos && out.bedrooms === null) out.bedrooms = asNumber(quartos[1]);

    const camas = line.match(/([\d.,]+)\s*camas?/i);
    if (camas && out.beds === null) out.beds = asNumber(camas[1]);

    const banheiros = line.match(/([\d.,]+)\s*banheiros?/i);
    if (banheiros && out.bathrooms === null) out.bathrooms = asNumber(banheiros[1]);

    const hospedes = line.match(/([\d.,]+)\s*h[óo]spedes?/i);
    if (hospedes && out.personCapacity === null) {
      out.personCapacity = asNumber(hospedes[1]);
    }

    if (/banheiro\s+compartilhado/i.test(line)) out.isSharedBathroom = true;
  }

  return out;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
