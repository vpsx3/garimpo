import { canonicalizeAmenities } from "@/lib/amenities/canonical";
import { breakdownFromListing, cleaningRatio, nightsBetween, priceHonesty } from "@/lib/ingest/price";
import type { RawListing, RawListingDetail, RawPriceQuote } from "@/lib/providers/types";
import { breakdownFromQuote } from "@/lib/ingest/price";
import { attachAnchorLimits, haversineMeters, type Anchor, type Row } from "@/lib/filters/apply";

/**
 * Montagem das linhas em memória.
 *
 * Sem banco, a "tabela" é o array que a origem devolveu. O passo 1 preenche o
 * que a busca ampla traz; o passo 2 sobrescreve com a cotação real e o
 * detalhe, quando o usuário pede.
 */

export function toRow(
  listing: RawListing,
  context: { checkIn: string; checkOut: string; guests: number; currency: string },
): Row {
  const nights = nightsBetween(context.checkIn, context.checkOut);
  const breakdown = breakdownFromListing(listing, {
    guests: context.guests,
    nights,
    currency: context.currency,
  });

  return {
    externalId: listing.externalId,
    title: listing.title ?? null,
    url: listing.url ?? `https://www.airbnb.com.br/rooms/${listing.externalId}`,
    roomType: listing.roomType ?? null,
    propertyType: listing.propertyType ?? null,
    personCapacity: listing.personCapacity ?? null,
    bedrooms: listing.bedrooms ?? null,
    beds: listing.beds ?? null,
    bathrooms: listing.bathrooms ?? null,
    isSharedBathroom: listing.isSharedBathroom ?? null,
    lat: listing.lat ?? null,
    lng: listing.lng ?? null,
    pictureCount: listing.pictureCount ?? listing.pictureUrls?.length ?? null,
    pictureUrls: listing.pictureUrls ?? null,
    ratingOverall: listing.ratingOverall ?? null,
    reviewCount: listing.reviewCount ?? null,
    isSuperhost: listing.isSuperhost ?? null,
    hostName: listing.hostName ?? null,
    amenities: canonicalizeAmenities(listing.amenities),
    instantBookable: listing.instantBookable ?? null,
    minNights: listing.minNights ?? null,
    maxNights: listing.maxNights ?? null,
    grossNightly: listing.price?.grossNightly ?? null,
    announcedTotal: listing.price?.totalPrice ?? null,
    currency: listing.price?.currency ?? context.currency,
    nights,
    guests: context.guests,
    effectiveNightly: breakdown?.effectiveNightly ?? null,
    totalPrice: breakdown?.totalPrice ?? null,
    cleaningFee: null,
    serviceFee: null,
    taxes: null,
    discountTotal: null,
    pricePerPerson: breakdown?.pricePerPerson ?? null,
    isAvailable: true,
    priceSource: "search",
    cleaningRatio: null,
    priceHonesty: null,
    bedsPerGuest: bedsPerGuest(listing.beds ?? null, listing.personCapacity ?? null),
    description: null,
    houseRules: null,
    ratingCleanliness: null,
    ratingAccuracy: null,
    ratingCheckin: null,
    ratingCommunication: null,
    ratingLocation: null,
    ratingValue: null,
    lastReviewAt: null,
    reviewsPerMonth: null,
    hostSince: null,
    hostListingCount: null,
    hostResponseRate: null,
    cancellationPolicy: null,
    reviews: [],
    anchorDistances: [],
    minAnchorDistanceM: null,
    verdict: null,
  };
}

function bedsPerGuest(beds: number | null, capacity: number | null): number | null {
  if (beds === null || !capacity) return null;
  return Math.round((beds / capacity) * 100) / 100;
}

/** Aplica a cotação real sobre a linha (passo 2). */
export function applyQuote(row: Row, quote: RawPriceQuote): Row {
  const breakdown = breakdownFromQuote(quote, {
    guests: row.guests,
    nights: row.nights,
    currency: row.currency,
  });

  if (!breakdown) {
    return { ...row, isAvailable: quote.isAvailable ?? row.isAvailable };
  }

  const next: Row = {
    ...row,
    grossNightly: breakdown.grossNightly ?? row.grossNightly,
    cleaningFee: breakdown.cleaningFee,
    serviceFee: breakdown.serviceFee,
    taxes: breakdown.taxes,
    discountTotal: breakdown.discountTotal,
    totalPrice: breakdown.totalPrice,
    effectiveNightly: breakdown.effectiveNightly,
    pricePerPerson: breakdown.pricePerPerson,
    currency: breakdown.currency,
    isAvailable: breakdown.isAvailable,
    priceSource: "quote",
  };

  next.cleaningRatio = cleaningRatio(breakdown);
  next.priceHonesty = priceHonesty(breakdown);
  return next;
}

/** Aplica o detalhe do anúncio sobre a linha (passo 2). */
export function applyDetail(row: Row, detail: RawListingDetail): Row {
  const amenities = canonicalizeAmenities(detail.amenities);
  return {
    ...row,
    description: detail.description ?? row.description,
    houseRules: detail.houseRules ?? row.houseRules,
    cancellationPolicy: detail.cancellationPolicy ?? row.cancellationPolicy,
    ratingCleanliness: detail.ratingCleanliness ?? row.ratingCleanliness,
    ratingAccuracy: detail.ratingAccuracy ?? row.ratingAccuracy,
    ratingCheckin: detail.ratingCheckin ?? row.ratingCheckin,
    ratingCommunication: detail.ratingCommunication ?? row.ratingCommunication,
    ratingLocation: detail.ratingLocation ?? row.ratingLocation,
    ratingValue: detail.ratingValue ?? row.ratingValue,
    lastReviewAt: detail.lastReviewAt ?? row.lastReviewAt,
    hostSince: detail.hostSince ?? row.hostSince,
    hostListingCount: detail.hostListingCount ?? row.hostListingCount,
    hostResponseRate: detail.hostResponseRate ?? row.hostResponseRate,
    isSharedBathroom: detail.isSharedBathroom ?? row.isSharedBathroom,
    bathrooms: detail.bathrooms ?? row.bathrooms,
    beds: detail.beds ?? row.beds,
    bedrooms: detail.bedrooms ?? row.bedrooms,
    personCapacity: detail.personCapacity ?? row.personCapacity,
    pictureCount: detail.pictureCount ?? row.pictureCount,
    pictureUrls: detail.pictureUrls ?? row.pictureUrls,
    amenities: amenities.length ? amenities : row.amenities,
    bedsPerGuest:
      bedsPerGuest(detail.beds ?? row.beds, detail.personCapacity ?? row.personCapacity) ??
      row.bedsPerGuest,
  };
}

/**
 * Distância a cada âncora. Substitui o `ST_Distance` do PostGIS — nessas
 * escalas a diferença entre esferoide e esfera é muito menor que os ~150 m de
 * ofuscação que a origem já introduz no pino.
 */
export function withAnchorDistances(rows: Row[], anchors: Anchor[]): Row[] {
  if (anchors.length === 0) {
    return rows.map((row) => ({ ...row, anchorDistances: [], minAnchorDistanceM: null }));
  }

  return rows.map((row) => {
    if (row.lat === null || row.lng === null) {
      return { ...row, anchorDistances: [], minAnchorDistanceM: null };
    }

    const distances = anchors.map((anchor) => ({
      anchorId: anchor.id,
      label: anchor.label,
      meters: haversineMeters(row.lat!, row.lng!, anchor.lat, anchor.lng),
    }));

    const next: Row = {
      ...row,
      anchorDistances: distances,
      minAnchorDistanceM: Math.min(...distances.map((distance) => distance.meters)),
    };

    attachAnchorLimits(
      next,
      new Map(anchors.map((anchor) => [anchor.id, anchor.maxDistanceM ?? null])),
    );

    return next;
  });
}
