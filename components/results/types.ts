import type { FilterDefinition } from "@/lib/filters/types";
import type { ScoreComponent } from "@/lib/scoring/engine";

/** Uma linha da tabela de resultados, tal como a consulta a devolve. */
export type ResultRow = {
  id: string;
  external_id: string;
  provider: string;
  url: string | null;
  title: string | null;
  property_type: string | null;
  room_type: string | null;
  person_capacity: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  is_shared_bathroom: boolean | null;
  lat: number | null;
  lng: number | null;
  picture_count: number | null;
  picture_urls: string[] | null;
  rating_overall: number | null;
  review_count: number | null;
  rating_cleanliness: number | null;
  rating_accuracy: number | null;
  rating_checkin: number | null;
  rating_communication: number | null;
  rating_location: number | null;
  rating_value: number | null;
  first_review_at: string | null;
  last_review_at: string | null;
  reviews_per_month: number | null;
  host_name: string | null;
  host_is_superhost: boolean | null;
  host_since: string | null;
  host_listing_count: number | null;
  host_response_rate: number | null;
  host_response_time: string | null;
  cancellation_policy: string | null;
  instant_bookable: boolean | null;
  min_nights: number | null;
  max_nights: number | null;
  description: string | null;
  house_rules: string | null;
  amenities: string[];
  detail_fetched_at: string | null;
  reviews_fetched_at: string | null;
  // do snapshot
  captured_at: string | null;
  nights: number | null;
  gross_nightly: number | null;
  cleaning_fee: number | null;
  service_fee: number | null;
  taxes: number | null;
  discount_total: number | null;
  total_price: number | null;
  effective_nightly: number | null;
  price_per_person: number | null;
  currency: string;
  is_available: boolean;
  price_source: string | null;
  // derivadas
  cleaning_ratio: number | null;
  price_honesty: number | null;
  beds_per_guest: number | null;
  snapshot_count: number | null;
  min_anchor_distance_m: number | null;
  verdict: string | null;
  verdict_note: string | null;
  // opcionais, preenchidas por etapas posteriores
  score?: number;
  score_breakdown?: ScoreComponent[];
  anchor_distances?: {
    anchorId: string;
    label: string;
    meters: number;
    maxDistanceM: number | null;
  }[];
  price_history?: { captured_at: string; effective_nightly: number | null }[];
  review_matches?: { comment: string; created_at_source: string | null }[];
};

export type EmptyDiagnosis = {
  base: number;
  perFilter: { key: string; label: string; survivors: number }[];
  culprits: { key: string; label: string }[];
};

export type ResultsResponse = {
  results: ResultRow[];
  total: number;
  diagnosis: EmptyDiagnosis | null;
};

export type FilterState = FilterDefinition;
