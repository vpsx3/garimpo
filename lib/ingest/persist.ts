import type { Sql } from "postgres";
import { canonicalizeAmenities } from "@/lib/amenities/canonical";
import { canonicalRoomType } from "@/lib/providers/apify/normalize";
import type {
  RawListing,
  RawListingDetail,
  RawReview,
} from "@/lib/providers/types";
import type { PriceBreakdown } from "./price";

/**
 * Escrita no banco.
 *
 * Regra inviolável da spec: o payload bruto é persistido **antes** de qualquer
 * parsing depender dele. Aqui isso é garantido por construção — `raw` entra
 * no mesmo INSERT dos campos normalizados, então um campo que o normalizador
 * não soube ler continua recuperável na coluna jsonb.
 */

export type UpsertedListing = { id: string; externalId: string };

/**
 * Deduplicação por (provider, external_id): um anúncio visto em buscas
 * diferentes é uma linha só. O UPDATE usa COALESCE para nunca apagar um
 * campo que já foi enriquecido com um null vindo da busca rasa.
 */
export async function upsertListings(
  sql: Sql,
  provider: string,
  listings: RawListing[],
): Promise<UpsertedListing[]> {
  if (listings.length === 0) return [];

  const rows = listings.map((listing) => ({
    provider,
    external_id: listing.externalId,
    url: listing.url ?? null,
    title: listing.title ?? null,
    property_type: listing.propertyType ?? null,
    room_type: listing.roomType ?? canonicalRoomType(listing.propertyType ?? null),
    person_capacity: listing.personCapacity ?? null,
    bedrooms: listing.bedrooms ?? null,
    beds: listing.beds ?? null,
    bathrooms: listing.bathrooms ?? null,
    is_shared_bathroom: listing.isSharedBathroom ?? null,
    lat: listing.lat ?? null,
    lng: listing.lng ?? null,
    picture_count: listing.pictureCount ?? listing.pictureUrls?.length ?? null,
    picture_urls: listing.pictureUrls ?? null,
    rating_overall: listing.ratingOverall ?? null,
    review_count: listing.reviewCount ?? null,
    host_external_id: listing.hostExternalId ?? null,
    host_name: listing.hostName ?? null,
    host_is_superhost: listing.isSuperhost ?? null,
    instant_bookable: listing.instantBookable ?? null,
    min_nights: listing.minNights ?? null,
    max_nights: listing.maxNights ?? null,
    amenities: canonicalizeAmenities(listing.amenities),
    // jsonb precisa ir pelo helper, senão o driver tenta serializar como texto.
    raw: sql.json((listing.raw ?? {}) as never),
  }));

  const inserted = await sql<{ id: string; external_id: string }[]>`
    insert into listings ${sql(rows)}
    on conflict (provider, external_id) do update set
      url = coalesce(excluded.url, listings.url),
      title = coalesce(excluded.title, listings.title),
      property_type = coalesce(excluded.property_type, listings.property_type),
      room_type = coalesce(excluded.room_type, listings.room_type),
      person_capacity = coalesce(excluded.person_capacity, listings.person_capacity),
      bedrooms = coalesce(excluded.bedrooms, listings.bedrooms),
      beds = coalesce(excluded.beds, listings.beds),
      bathrooms = coalesce(excluded.bathrooms, listings.bathrooms),
      is_shared_bathroom = coalesce(excluded.is_shared_bathroom, listings.is_shared_bathroom),
      lat = coalesce(excluded.lat, listings.lat),
      lng = coalesce(excluded.lng, listings.lng),
      picture_count = coalesce(excluded.picture_count, listings.picture_count),
      picture_urls = coalesce(excluded.picture_urls, listings.picture_urls),
      rating_overall = coalesce(excluded.rating_overall, listings.rating_overall),
      review_count = coalesce(excluded.review_count, listings.review_count),
      host_external_id = coalesce(excluded.host_external_id, listings.host_external_id),
      host_name = coalesce(excluded.host_name, listings.host_name),
      host_is_superhost = coalesce(excluded.host_is_superhost, listings.host_is_superhost),
      instant_bookable = coalesce(excluded.instant_bookable, listings.instant_bookable),
      min_nights = coalesce(excluded.min_nights, listings.min_nights),
      max_nights = coalesce(excluded.max_nights, listings.max_nights),
      -- amenidades da busca rasa vêm incompletas: só substituem se vierem.
      amenities = case
        when cardinality(excluded.amenities) > 0 then excluded.amenities
        else listings.amenities
      end,
      raw = listings.raw || excluded.raw,
      updated_at = now()
    returning id, external_id
  `;

  return inserted.map((row) => ({ id: row.id, externalId: row.external_id }));
}

/** Atualiza um anúncio com o que só o detalhe traz (Etapa D do pipeline). */
export async function updateListingDetail(
  sql: Sql,
  listingId: string,
  detail: RawListingDetail,
): Promise<void> {
  const amenities = canonicalizeAmenities(detail.amenities);

  await sql`
    update listings set
      description = coalesce(${detail.description ?? null}, description),
      house_rules = coalesce(${detail.houseRules ?? null}, house_rules),
      space_text = coalesce(${detail.spaceText ?? null}, space_text),
      neighborhood_text = coalesce(${detail.neighborhoodText ?? null}, neighborhood_text),
      cancellation_policy = coalesce(${detail.cancellationPolicy ?? null}, cancellation_policy),
      rating_cleanliness = coalesce(${detail.ratingCleanliness ?? null}, rating_cleanliness),
      rating_accuracy = coalesce(${detail.ratingAccuracy ?? null}, rating_accuracy),
      rating_checkin = coalesce(${detail.ratingCheckin ?? null}, rating_checkin),
      rating_communication = coalesce(${detail.ratingCommunication ?? null}, rating_communication),
      rating_location = coalesce(${detail.ratingLocation ?? null}, rating_location),
      rating_value = coalesce(${detail.ratingValue ?? null}, rating_value),
      first_review_at = coalesce(${detail.firstReviewAt ?? null}, first_review_at),
      last_review_at = coalesce(${detail.lastReviewAt ?? null}, last_review_at),
      host_since = coalesce(${detail.hostSince ?? null}, host_since),
      host_listing_count = coalesce(${detail.hostListingCount ?? null}, host_listing_count),
      host_response_rate = coalesce(${detail.hostResponseRate ?? null}, host_response_rate),
      host_response_time = coalesce(${detail.hostResponseTime ?? null}, host_response_time),
      is_shared_bathroom = coalesce(${detail.isSharedBathroom ?? null}, is_shared_bathroom),
      bathrooms = coalesce(${detail.bathrooms ?? null}, bathrooms),
      beds = coalesce(${detail.beds ?? null}, beds),
      bedrooms = coalesce(${detail.bedrooms ?? null}, bedrooms),
      person_capacity = coalesce(${detail.personCapacity ?? null}, person_capacity),
      picture_count = coalesce(${detail.pictureCount ?? null}, picture_count),
      amenities = case
        when ${amenities.length} > 0 then ${amenities}::text[]
        else amenities
      end,
      raw = raw || ${sql.json({ detail: detail.raw ?? null } as never)},
      detail_fetched_at = now(),
      updated_at = now()
    where id = ${listingId}
  `;

  await recomputeReviewCadence(sql, listingId);
}

export async function insertSnapshot(
  sql: Sql,
  params: {
    listingId: string;
    searchId: string | null;
    breakdown: PriceBreakdown;
    raw?: unknown;
  },
): Promise<void> {
  const { breakdown } = params;
  await sql`
    insert into listing_snapshots (
      listing_id, search_id, nights, gross_nightly, cleaning_fee, service_fee,
      taxes, discount_total, total_price, effective_nightly, price_per_person,
      currency, is_available, source, raw
    ) values (
      ${params.listingId}, ${params.searchId}, ${breakdown.nights},
      ${breakdown.grossNightly}, ${breakdown.cleaningFee}, ${breakdown.serviceFee},
      ${breakdown.taxes}, ${breakdown.discountTotal}, ${breakdown.totalPrice},
      ${breakdown.effectiveNightly}, ${breakdown.pricePerPerson},
      ${breakdown.currency}, ${breakdown.isAvailable}, ${breakdown.source},
      ${sql.json((params.raw ?? null) as never)}
    )
  `;
}

export async function insertReviews(
  sql: Sql,
  listingId: string,
  reviews: RawReview[],
): Promise<number> {
  if (reviews.length === 0) return 0;

  const rows = reviews
    .filter((review) => review.comment)
    .map((review, index) => ({
      listing_id: listingId,
      // Sem id da origem, um id sintético estável evita duplicar na próxima
      // ingestão e ainda respeita o unique (listing_id, external_id).
      external_id: review.externalId ?? `sintetico:${index}:${hash(review.comment!)}`,
      created_at_source: review.createdAt ?? null,
      rating: review.rating ?? null,
      language: review.language ?? null,
      comment: review.comment ?? null,
    }));

  if (rows.length === 0) return 0;

  const inserted = await sql<{ id: string }[]>`
    insert into reviews ${sql(rows)}
    on conflict (listing_id, external_id) do update set
      comment = excluded.comment,
      rating = coalesce(excluded.rating, reviews.rating),
      created_at_source = coalesce(excluded.created_at_source, reviews.created_at_source)
    returning id
  `;

  await sql`update listings set reviews_fetched_at = now() where id = ${listingId}`;
  await recomputeReviewCadence(sql, listingId);
  return inserted.length;
}

/**
 * `reviews_per_month` é proxy de ocupação e de anúncio vivo. Derivamos das
 * avaliações que temos, ou da janela primeira/última quando só há as datas.
 */
export async function recomputeReviewCadence(
  sql: Sql,
  listingId: string,
): Promise<void> {
  await sql`
    with janela as (
      select
        min(created_at_source) as primeira,
        max(created_at_source) as ultima,
        count(*) filter (where created_at_source is not null) as total
      from reviews
      where listing_id = ${listingId}
    )
    update listings l set
      first_review_at = coalesce(l.first_review_at, janela.primeira),
      last_review_at = greatest(l.last_review_at, janela.ultima),
      reviews_per_month = case
        when coalesce(l.review_count, 0) = 0 then 0
        when coalesce(l.first_review_at, janela.primeira) is null then l.reviews_per_month
        else round(
          l.review_count::numeric / greatest(
            1,
            extract(epoch from (
              now() - coalesce(l.first_review_at, janela.primeira)::timestamptz
            )) / 2629800
          ),
          2
        )
      end
    from janela
    where l.id = ${listingId}
  `;
}

/** Hash curto e estável para gerar id sintético de avaliação sem id. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
