import { asCoordinate, firstDefined } from "@/lib/providers/extract";

/**
 * Varredura de forma, não navegação por caminho.
 *
 * O payload do GraphQL da origem é uma árvore profunda cuja estrutura muda
 * sem aviso. Fixar caminhos (`data.presentation.staysSearch.results...`) é
 * garantir quebra a cada mudança de layout deles. Em vez disso descemos a
 * árvore inteira e reconhecemos nós pelo *formato*: um nó que tem um id e
 * pelo menos dois sinais de anúncio é um anúncio.
 */

const MAX_DEPTH = 14;

type Visitor = (node: Record<string, unknown>) => void;

function walk(value: unknown, visit: Visitor, depth = 0, seen = new Set<unknown>()) {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1, seen);
    return;
  }

  const record = value as Record<string, unknown>;
  visit(record);
  for (const child of Object.values(record)) {
    walk(child, visit, depth + 1, seen);
  }
}

const LISTING_SIGNALS = [
  "roomTypeCategory",
  "personCapacity",
  "avgRating",
  "avgRatingLocalized",
  "coordinate",
  "structuredContent",
  "pictureUrls",
  "contextualPictures",
  "reviewsCount",
  "bathrooms",
  "bedrooms",
];

/**
 * Achata um nó de anúncio do GraphQL para a forma plana que os extratores
 * esperam, resolvendo os apelidos mais comuns da origem.
 */
function flattenListingNode(node: Record<string, unknown>): Record<string, unknown> {
  const coordinate = node.coordinate ?? node.location ?? node.coordinates;
  const pictures = node.contextualPictures ?? node.pictureUrls ?? node.images;

  return {
    ...node,
    id: decodeListingId(
      firstDefined(node, ["id", "listingId", "listing.id", "encodedId"]),
    ),
    name: firstDefined(node, ["name", "title", "listing.name", "localizedCityName"]),
    lat: asCoordinate(
      firstDefined({ coordinate }, ["coordinate.latitude", "coordinate.lat"]),
    ),
    lng: asCoordinate(
      firstDefined({ coordinate }, [
        "coordinate.longitude",
        "coordinate.lng",
        "coordinate.lon",
      ]),
    ),
    rating: firstDefined(node, ["avgRating", "avgRatingA11yLabel", "starRating", "rating"]),
    reviewsCount: firstDefined(node, ["reviewsCount", "visibleReviewCount", "reviewCount"]),
    roomType: firstDefined(node, ["roomTypeCategory", "roomType", "spaceType"]),
    pictureCount: Array.isArray(pictures) ? pictures.length : undefined,
    images: Array.isArray(pictures)
      ? pictures.map((picture) =>
          typeof picture === "string"
            ? picture
            : (picture as Record<string, unknown>)?.picture,
        )
      : undefined,
  };
}

export function collectListingNodes(payload: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const ids = new Set<string>();

  walk(payload, (node) => {
    const id = decodeListingId(
      firstDefined(node, ["id", "listingId", "listing.id", "encodedId"]),
    );
    if (!id) return;

    const signals = LISTING_SIGNALS.filter((key) => node[key] !== undefined).length;
    if (signals < 2) return;
    if (ids.has(id)) return;

    ids.add(id);
    found.push(flattenListingNode(node));
  });

  return found;
}

const REVIEW_SIGNALS = ["comments", "localizedDate", "reviewer", "rating", "language"];

export function collectReviewNodes(payload: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];

  walk(payload, (node) => {
    const comment = node.comments ?? node.comment ?? node.text;
    if (typeof comment !== "string" || comment.trim().length === 0) return;
    const signals = REVIEW_SIGNALS.filter((key) => node[key] !== undefined).length;
    if (signals < 2) return;
    found.push(node);
  });

  return found;
}

/**
 * Reconhece as linhas da decomposição de preço pelo rótulo, porque a origem
 * não expõe os componentes em campos estáveis — expõe uma lista de itens
 * rotulados para a UI.
 */
export function extractPriceBreakdown(payload: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  walk(payload, (node) => {
    const label = node.localizedTitle ?? node.title ?? node.label;
    const amount =
      firstDefined(node, [
        "total.amountFormatted",
        "total.amount",
        "amountFormatted",
        "priceString",
        "amount",
        "value",
      ]) ?? null;

    if (typeof label === "string" && amount !== null) {
      const key = classifyPriceLabel(label);
      if (key && result[key] === undefined) result[key] = amount;
    }

    // O total costuma aparecer num nó próprio, sem rótulo textual.
    const explicitTotal = firstDefined(node, [
      "priceBreakdown.total.total.amount",
      "total.total.amount",
    ]);
    if (explicitTotal !== undefined && result.totalPrice === undefined) {
      result.totalPrice = explicitTotal;
    }

    const nightly = firstDefined(node, [
      "structuredDisplayPrice.primaryLine.price",
      "price.rate.amount",
      "rate.amount",
    ]);
    if (nightly !== undefined && result.nightlyRate === undefined) {
      result.nightlyRate = nightly;
    }

    if (node.currency !== undefined && result.currency === undefined) {
      result.currency = node.currency;
    }
  });

  return result;
}

function classifyPriceLabel(label: string): string | null {
  const normalized = label.toLowerCase();
  if (/(taxa de limpeza|cleaning fee)/.test(normalized)) return "cleaningFee";
  if (/(taxa de servi|service fee)/.test(normalized)) return "serviceFee";
  if (/(imposto|taxes|tax)/.test(normalized)) return "taxes";
  if (/(desconto|discount|savings)/.test(normalized)) return "discount";
  if (/(total)/.test(normalized)) return "totalPrice";
  if (/(x noite|nights?|diária|por noite)/.test(normalized)) return "nightlyRate";
  return null;
}

/** `StayListing:12345` em base64 volta a ser `12345`. */
export function decodeListingId(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || !value) return null;
  if (/^\d+$/.test(value)) return value;

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      const match = decoded.match(/^(?:StayListing|DemandStayListing):(\d+)$/);
      if (match) return match[1];
    } catch {
      // Não era base64; segue com o valor original.
    }
  }
  return value;
}
