import {
  asBoolean,
  asCoordinate,
  asDate,
  asInt,
  asNumber,
  asPercent,
  asRating,
  asString,
  asStringArray,
  firstDefined,
} from "@/lib/providers/extract";
import type {
  RawListing,
  RawListingDetail,
  RawPriceQuote,
  RawReview,
} from "@/lib/providers/types";

/**
 * Cada actor de Airbnb na Apify nomeia os campos do seu jeito, e os nomes
 * mudam entre versões. Em vez de acoplar a um deles, procuramos cada valor
 * numa lista de caminhos plausíveis e aceitamos o primeiro que existir.
 */

const ID_PATHS = ["id", "listingId", "roomId", "listing.id", "room_id", "pk"];
const URL_PATHS = ["url", "listingUrl", "roomUrl", "link", "listing.url"];
const TITLE_PATHS = ["name", "title", "listingName", "listing.name"];
const LAT_PATHS = ["lat", "latitude", "coordinates.lat", "location.lat", "listing.lat"];
const LNG_PATHS = [
  "lng",
  "lon",
  "longitude",
  "coordinates.lng",
  "coordinates.lon",
  "location.lng",
  "listing.lng",
];

export function normalizeListing(item: unknown): RawListing | null {
  const externalId = asString(firstDefined(item, ID_PATHS));
  if (!externalId) return null;

  const roomTypeLabel = asString(
    firstDefined(item, ["roomType", "room_type", "roomTypeCategory", "propertyType"]),
  );

  return {
    externalId,
    url:
      asString(firstDefined(item, URL_PATHS)) ??
      `https://www.airbnb.com.br/rooms/${externalId}`,
    title: asString(firstDefined(item, TITLE_PATHS)),
    propertyType: asString(
      firstDefined(item, ["propertyType", "property_type", "roomTypeCategory"]),
    ),
    roomType: canonicalRoomType(roomTypeLabel),
    personCapacity: asInt(
      firstDefined(item, ["personCapacity", "guestCapacity", "capacity", "maxGuests"]),
    ),
    bedrooms: asInt(firstDefined(item, ["bedrooms", "numberOfBedrooms", "bedroomCount"])),
    beds: asInt(firstDefined(item, ["beds", "numberOfBeds", "bedCount"])),
    bathrooms: asNumber(
      firstDefined(item, ["bathrooms", "numberOfBathrooms", "bathroomCount"]),
    ),
    isSharedBathroom: detectSharedBathroom(item),
    lat: asCoordinate(firstDefined(item, LAT_PATHS)),
    lng: asCoordinate(firstDefined(item, LNG_PATHS)),
    pictureCount: asInt(firstDefined(item, ["pictureCount", "photosCount", "imageCount"])),
    pictureUrls: asStringArray(
      firstDefined(item, ["images", "pictures", "photos", "pictureUrls", "thumbnails"]),
    ),
    ratingOverall: asRating(
      firstDefined(item, [
        "rating",
        "stars",
        "avgRating",
        "starRating",
        "rating.guestSatisfaction",
        "reviews.rating",
      ]),
    ),
    reviewCount: asInt(
      firstDefined(item, [
        "reviewsCount",
        "numberOfReviews",
        "reviewCount",
        "rating.reviewsCount",
        "reviews.count",
      ]),
    ),
    isSuperhost: asBoolean(
      firstDefined(item, ["isSuperhost", "superhost", "host.isSuperHost", "primaryHost.isSuperhost"]),
    ),
    hostExternalId: asString(firstDefined(item, ["hostId", "host.id", "primaryHost.id"])),
    hostName: asString(firstDefined(item, ["hostName", "host.name", "primaryHost.name"])),
    amenities: asStringArray(firstDefined(item, ["amenities", "amenityIds", "features"])),
    instantBookable: asBoolean(
      firstDefined(item, ["instantBookable", "isInstantBookable", "instantBook"]),
    ),
    minNights: asInt(firstDefined(item, ["minNights", "minimumNights", "minimumStay"])),
    maxNights: asInt(firstDefined(item, ["maxNights", "maximumNights", "maximumStay"])),
    price: {
      grossNightly: asNumber(
        firstDefined(item, [
          "price",
          "pricing.rate.amount",
          "price.rate",
          "price.amount",
          "pricing.nightlyPrice",
          "rate",
        ]),
      ),
      totalPrice: asNumber(
        firstDefined(item, [
          "totalPrice",
          "pricing.total.amount",
          "price.total",
          "price.totalPrice",
          "pricing.rateWithServiceFee.amount",
        ]),
      ),
      currency: asString(
        firstDefined(item, ["currency", "pricing.rate.currency", "price.currency"]),
      ),
    },
    raw: item,
  };
}

export function normalizeListingDetail(item: unknown): RawListingDetail | null {
  const base = normalizeListing(item);
  if (!base) return null;

  return {
    ...base,
    description: asString(
      firstDefined(item, ["description", "summary", "sectionedDescription.description"]),
    ),
    houseRules: asString(
      firstDefined(item, ["houseRules", "house_rules", "sectionedDescription.houseRules"]),
    ),
    spaceText: asString(firstDefined(item, ["space", "sectionedDescription.space"])),
    neighborhoodText: asString(
      firstDefined(item, ["neighborhoodOverview", "sectionedDescription.neighborhoodOverview"]),
    ),
    cancellationPolicy: canonicalCancellationPolicy(
      asString(firstDefined(item, ["cancellationPolicy", "cancellation_policy", "cancelPolicy"])),
    ),
    ratingCleanliness: asRating(
      firstDefined(item, ["ratingCleanliness", "reviewDetailsInterface.cleanlinessRating", "ratings.cleanliness"]),
    ),
    ratingAccuracy: asRating(
      firstDefined(item, ["ratingAccuracy", "reviewDetailsInterface.accuracyRating", "ratings.accuracy"]),
    ),
    ratingCheckin: asRating(
      firstDefined(item, ["ratingCheckin", "reviewDetailsInterface.checkinRating", "ratings.checkin"]),
    ),
    ratingCommunication: asRating(
      firstDefined(item, ["ratingCommunication", "reviewDetailsInterface.communicationRating", "ratings.communication"]),
    ),
    ratingLocation: asRating(
      firstDefined(item, ["ratingLocation", "reviewDetailsInterface.locationRating", "ratings.location"]),
    ),
    ratingValue: asRating(
      firstDefined(item, ["ratingValue", "reviewDetailsInterface.valueRating", "ratings.value"]),
    ),
    firstReviewAt: asDate(firstDefined(item, ["firstReviewAt", "firstReview", "reviews.first"])),
    lastReviewAt: asDate(firstDefined(item, ["lastReviewAt", "lastReview", "reviews.last"])),
    hostSince: asDate(
      firstDefined(item, ["hostSince", "host.since", "host.createdAt", "primaryHost.createdAt"]),
    ),
    hostListingCount: asInt(
      firstDefined(item, ["hostListingCount", "host.listingsCount", "host.totalListingsCount"]),
    ),
    hostResponseRate: asPercent(
      firstDefined(item, ["hostResponseRate", "host.responseRate", "primaryHost.responseRate"]),
    ),
    hostResponseTime: asString(
      firstDefined(item, ["hostResponseTime", "host.responseTime", "primaryHost.responseTime"]),
    ),
  };
}

export function normalizePriceQuote(
  item: unknown,
  externalId: string,
  nights: number,
): RawPriceQuote {
  const cleaningFee = asNumber(
    firstDefined(item, ["cleaningFee", "fees.cleaning", "price.cleaningFee", "cleaning_fee"]),
  );
  const serviceFee = asNumber(
    firstDefined(item, ["serviceFee", "fees.service", "price.serviceFee", "service_fee"]),
  );
  const taxes = asNumber(firstDefined(item, ["taxes", "fees.taxes", "price.taxes"]));
  const discountTotal = asNumber(
    firstDefined(item, ["discount", "discountTotal", "price.discount", "savings"]),
  );
  const grossNightly = asNumber(
    firstDefined(item, ["nightlyRate", "price.rate", "pricing.rate.amount", "basePrice", "price"]),
  );
  const totalPrice = asNumber(
    firstDefined(item, ["totalPrice", "total", "price.total", "pricing.total.amount"]),
  );

  return {
    externalId,
    nights,
    grossNightly,
    cleaningFee,
    serviceFee,
    taxes,
    discountTotal,
    totalPrice,
    currency: asString(firstDefined(item, ["currency", "price.currency", "pricing.rate.currency"])),
    isAvailable: asBoolean(firstDefined(item, ["isAvailable", "available", "bookable"])) ?? true,
    raw: item,
  };
}

export function normalizeReview(item: unknown): RawReview | null {
  const comment = asString(firstDefined(item, ["comments", "comment", "text", "review"]));
  if (!comment) return null;
  return {
    externalId: asString(firstDefined(item, ["id", "reviewId", "externalId"])),
    createdAt: asDate(firstDefined(item, ["createdAt", "created_at", "date", "localizedDate"])),
    rating: asInt(firstDefined(item, ["rating", "stars", "score"])),
    language: asString(firstDefined(item, ["language", "lang", "locale"])),
    comment,
  };
}

/** A origem rotula o tipo de quarto de formas diferentes por idioma. */
export function canonicalRoomType(label: string | null): string | null {
  if (!label) return null;
  // A origem mistura rótulos de UI ("Quarto privativo"), chaves já canônicas
  // ("private_room") e variantes em inglês no mesmo dataset.
  const normalized = label.toLowerCase().replace(/[_-]+/g, " ");
  if (/hotel/.test(normalized)) return "hotel_room";
  if (/(shared|compartilhad)/.test(normalized)) return "shared_room";
  if (/(private room|quarto privativo|privado)/.test(normalized)) return "private_room";
  if (/(entire|inteir|todo o)/.test(normalized)) return "entire_home";
  return null;
}

/** Escala ordenada de §7.7: flexible < moderate < strict < super_strict. */
export function canonicalCancellationPolicy(label: string | null): string | null {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (/(super.?strict|super.?rigoros)/.test(normalized)) return "super_strict";
  if (/(strict|rigoros)/.test(normalized)) return "strict";
  if (/(moderate|moderad)/.test(normalized)) return "moderate";
  if (/(flexible|flexív|flexiv)/.test(normalized)) return "flexible";
  return null;
}

function detectSharedBathroom(item: unknown): boolean | null {
  const explicit = asBoolean(firstDefined(item, ["isSharedBathroom", "sharedBathroom"]));
  if (explicit !== null) return explicit;
  const label = asString(
    firstDefined(item, ["bathroomLabel", "bathroomType", "bathroomShared", "bathroomText"]),
  );
  if (!label) return null;
  return /(shared|compartilhad)/i.test(label);
}
