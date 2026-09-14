import { asNumber, asPercent, firstDefined } from "@/lib/providers/extract";
import { findGraphqlPayloads } from "./page";

/**
 * Extração da página de um anúncio.
 *
 * A primeira versão achatava a árvore pegando a primeira chave com o nome
 * certo, e isso escolhia o nó errado: existe um `amenities` de telemetria,
 * sempre vazio, que aparece antes do de verdade. O resultado era detalhe
 * carregado com sucesso e nenhuma amenidade — e, com o filtro estrito de
 * palavra-chave, uma lista vazia sem explicação.
 *
 * Aqui os caminhos são explícitos, com varredura por formato só como reserva.
 */

export type PdpDetail = {
  description: string | null;
  houseRules: string | null;
  amenities: string[];
  personCapacity: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  ratingOverall: number | null;
  reviewCount: number | null;
  ratingCleanliness: number | null;
  ratingAccuracy: number | null;
  ratingCheckin: number | null;
  ratingCommunication: number | null;
  ratingLocation: number | null;
  ratingValue: number | null;
  hostName: string | null;
  hostIsSuperhost: boolean | null;
  hostListingCount: number | null;
  hostResponseRate: number | null;
  lat: number | null;
  lng: number | null;
};

export function extractPdpDetail(state: unknown): PdpDetail {
  const pdp = findPdpPresentation(state);

  const detail: PdpDetail = {
    description: text(
      firstDefined(pdp, [
        "descriptions.longDescriptionHtml.localizedStringWithTranslationPreference",
        "descriptions.descriptionSections.0.html.localizedStringWithTranslationPreference",
      ]),
    ),
    houseRules: collectHouseRules(pdp),
    amenities: collectAmenities(pdp),
    personCapacity: asNumber(firstDefined(pdp, ["personCapacity"])),
    bedrooms: null,
    beds: null,
    bathrooms: null,
    ratingOverall: asNumber(
      firstDefined(pdp, [
        "quality.listingRatingStats.overallRatingStats.ratingAverage",
      ]),
    ),
    reviewCount: asNumber(
      firstDefined(pdp, [
        "quality.listingRatingStats.overallRatingStats.ratingCount",
      ]),
    ),
    ratingCleanliness: null,
    ratingAccuracy: null,
    ratingCheckin: null,
    ratingCommunication: null,
    ratingLocation: null,
    ratingValue: null,
    hostName: text(firstDefined(pdp, ["hostInfo.title", "hostInfo.hostName"])),
    hostIsSuperhost: null,
    hostListingCount: null,
    hostResponseRate: null,
    lat: asNumber(firstDefined(pdp, ["location.coordinate.latitude", "location.lat"])),
    lng: asNumber(firstDefined(pdp, ["location.coordinate.longitude", "location.lng"])),
  };

  // As sub-notas ficam num nó de estatísticas que não tem caminho estável;
  // procuramos pelo conjunto de chaves, que é inconfundível.
  const stats = findRatingStats(state);
  if (stats) {
    detail.ratingCleanliness = asNumber(stats.cleanlinessRating);
    detail.ratingAccuracy = asNumber(stats.accuracyRating);
    detail.ratingCheckin = asNumber(stats.checkinRating);
    detail.ratingCommunication = asNumber(stats.communicationRating);
    detail.ratingLocation = asNumber(stats.locationRating);
    detail.ratingValue = asNumber(stats.valueRating);
    detail.ratingOverall ??= asNumber(stats.starRating);
    detail.reviewCount ??= asNumber(stats.reviewCount);
  }

  const host = findHostInfo(state);
  if (host) {
    detail.hostName ??= text(host.name ?? host.hostName);
    detail.hostIsSuperhost = Boolean(host.isSuperhost ?? host.isSuperHost ?? null);
    detail.hostListingCount = asNumber(host.listingsCount ?? host.totalListingsCount);
    detail.hostResponseRate = asPercent(host.responseRate ?? host.responseRateWithoutCtaTo);
  }

  Object.assign(detail, parseOverview(pdp));
  return detail;
}

/** O nó da PDP. Reconhecido pelas chaves que só ele tem. */
function findPdpPresentation(state: unknown): Record<string, unknown> {
  for (const payload of findGraphqlPayloads(state)) {
    const direct = firstDefined(payload, [
      "data.node.pdpPresentation",
      "data.presentation.stayProductDetailPage.pdpPresentation",
    ]);
    if (direct && typeof direct === "object") {
      return direct as Record<string, unknown>;
    }
  }

  let found: Record<string, unknown> | null = null;
  visit(state, (node) => {
    if (found) return;
    if (node.amenities !== undefined && node.descriptions !== undefined) {
      found = node;
    }
  });
  return found ?? {};
}

/**
 * Amenidades reais: `previewAmenitiesGroups` e `seeAllAmenitiesGroups`.
 * O nó homônimo de telemetria vem sempre vazio e é ignorado por construção,
 * já que só lemos estes dois caminhos.
 */
function collectAmenities(pdp: Record<string, unknown>): string[] {
  const titles = new Set<string>();

  for (const path of [
    "amenities.previewAmenitiesGroups",
    "amenities.seeAllAmenitiesGroups",
  ]) {
    const groups = firstDefined(pdp, [path]);
    if (!Array.isArray(groups)) continue;
    for (const group of groups as Record<string, unknown>[]) {
      const items = group?.amenities;
      if (!Array.isArray(items)) continue;
      for (const item of items as Record<string, unknown>[]) {
        const title = text(item?.title);
        // `available: false` marca o que o anúncio explicitamente não tem.
        if (title && item?.available !== false) titles.add(title);
      }
    }
  }

  return [...titles];
}

function collectHouseRules(pdp: Record<string, unknown>): string | null {
  const groups = firstDefined(pdp, ["rules.groupItems"]);
  if (!Array.isArray(groups)) return null;

  const linhas: string[] = [];
  for (const group of groups as Record<string, unknown>[]) {
    const items = group?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items as Record<string, unknown>[]) {
      const title = text(item?.title);
      if (title) linhas.push(title);
    }
  }
  return linhas.length ? linhas.join("\n") : null;
}

/** "2 quartos", "5 hóspedes", "1,5 banheiro" do resumo do anúncio. */
function parseOverview(pdp: Record<string, unknown>): Partial<PdpDetail> {
  const out: Partial<PdpDetail> = {};
  const overview = firstDefined(pdp, ["overview"]);
  if (!Array.isArray(overview)) return out;

  for (const item of overview as Record<string, unknown>[]) {
    const label = text(item?.title) ?? "";
    const quartos = label.match(/([\d.,]+)\s*quartos?/i);
    if (quartos && out.bedrooms == null) out.bedrooms = asNumber(quartos[1]);
    const camas = label.match(/([\d.,]+)\s*camas?/i);
    if (camas && out.beds == null) out.beds = asNumber(camas[1]);
    const banheiros = label.match(/([\d.,]+)\s*banheiros?/i);
    if (banheiros && out.bathrooms == null) out.bathrooms = asNumber(banheiros[1]);
    const hospedes = label.match(/([\d.,]+)\s*h[óo]spedes?/i);
    if (hospedes && out.personCapacity == null) {
      out.personCapacity = asNumber(hospedes[1]);
    }
  }
  return out;
}

function findRatingStats(state: unknown): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  visit(state, (node) => {
    if (found) return;
    if (node.cleanlinessRating !== undefined && node.communicationRating !== undefined) {
      found = node;
    }
  });
  return found;
}

function findHostInfo(state: unknown): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  visit(state, (node) => {
    if (found) return;
    const superhost = node.isSuperhost ?? node.isSuperHost;
    if (superhost !== undefined && (node.name !== undefined || node.hostName !== undefined)) {
      found = node;
    }
  });
  return found;
}

function visit(
  value: unknown,
  fn: (node: Record<string, unknown>) => void,
  depth = 0,
): void {
  if (depth > 16 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, fn, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  fn(record);
  for (const child of Object.values(record)) visit(child, fn, depth + 1);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
