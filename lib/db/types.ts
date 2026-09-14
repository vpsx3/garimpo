/**
 * Gerado por `generate_typescript_types` (MCP do Supabase).
 * Não editar à mão: regenerar após cada migration.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          id: string
          kind: string
          listing_id: string | null
          payload: Json | null
          read_at: string | null
          search_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          listing_id?: string | null
          payload?: Json | null
          read_at?: string | null
          search_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          listing_id?: string | null
          payload?: Json | null
          read_at?: string | null
          search_id?: string | null
        }
      }
      anchors: {
        Row: {
          address: string | null
          created_at: string
          geo: unknown
          id: string
          label: string
          max_distance_m: number | null
          search_id: string
          weight: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          geo: unknown
          id?: string
          label: string
          max_distance_m?: number | null
          search_id: string
          weight?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          label?: string
          max_distance_m?: number | null
          search_id?: string
          weight?: number
        }
      }
      filter_sets: {
        Row: {
          created_at: string
          definition: Json
          id: string
          label: string
          scoring_weights: Json | null
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          label: string
          scoring_weights?: Json | null
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          label?: string
          scoring_weights?: Json | null
        }
      }
      geocode_cache: {
        Row: {
          created_at: string
          display_name: string | null
          lat: number | null
          lng: number | null
          query: string
          raw: Json | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          lat?: number | null
          lng?: number | null
          query: string
          raw?: Json | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          lat?: number | null
          lng?: number | null
          query?: string
          raw?: Json | null
        }
      }
      listing_snapshots: {
        Row: {
          captured_at: string
          cleaning_fee: number | null
          currency: string
          discount_total: number | null
          effective_nightly: number | null
          gross_nightly: number | null
          id: string
          is_available: boolean
          listing_id: string
          nights: number
          price_per_person: number | null
          raw: Json | null
          search_id: string | null
          service_fee: number | null
          source: string
          taxes: number | null
          total_price: number
        }
        Insert: {
          captured_at?: string
          cleaning_fee?: number | null
          currency?: string
          discount_total?: number | null
          effective_nightly?: number | null
          gross_nightly?: number | null
          id?: string
          is_available?: boolean
          listing_id: string
          nights: number
          price_per_person?: number | null
          raw?: Json | null
          search_id?: string | null
          service_fee?: number | null
          source?: string
          taxes?: number | null
          total_price: number
        }
        Update: {
          captured_at?: string
          cleaning_fee?: number | null
          currency?: string
          discount_total?: number | null
          effective_nightly?: number | null
          gross_nightly?: number | null
          id?: string
          is_available?: boolean
          listing_id?: string
          nights?: number
          price_per_person?: number | null
          raw?: Json | null
          search_id?: string | null
          service_fee?: number | null
          source?: string
          taxes?: number | null
          total_price?: number
        }
      }
      listing_verdicts: {
        Row: {
          listing_id: string
          note: string | null
          updated_at: string
          verdict: string
        }
        Insert: {
          listing_id: string
          note?: string | null
          updated_at?: string
          verdict: string
        }
        Update: {
          listing_id?: string
          note?: string | null
          updated_at?: string
          verdict?: string
        }
      }
      listings: {
        Row: {
          amenities: string[]
          bathrooms: number | null
          bedrooms: number | null
          beds: number | null
          cancellation_policy: string | null
          created_at: string
          description: string | null
          detail_fetched_at: string | null
          external_id: string
          first_review_at: string | null
          geo: unknown
          host_external_id: string | null
          host_is_superhost: boolean | null
          host_listing_count: number | null
          host_name: string | null
          host_response_rate: number | null
          host_response_time: string | null
          host_since: string | null
          house_rules: string | null
          id: string
          instant_bookable: boolean | null
          is_shared_bathroom: boolean | null
          last_review_at: string | null
          lat: number | null
          lng: number | null
          max_nights: number | null
          min_nights: number | null
          neighborhood_text: string | null
          person_capacity: number | null
          picture_count: number | null
          picture_urls: string[] | null
          property_type: string | null
          provider: string
          rating_accuracy: number | null
          rating_checkin: number | null
          rating_cleanliness: number | null
          rating_communication: number | null
          rating_location: number | null
          rating_overall: number | null
          rating_value: number | null
          raw: Json
          review_count: number | null
          reviews_fetched_at: string | null
          reviews_per_month: number | null
          room_type: string | null
          space_text: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          amenities?: string[]
          bathrooms?: number | null
          bedrooms?: number | null
          beds?: number | null
          cancellation_policy?: string | null
          created_at?: string
          description?: string | null
          detail_fetched_at?: string | null
          external_id: string
          first_review_at?: string | null
          geo?: unknown
          host_external_id?: string | null
          host_is_superhost?: boolean | null
          host_listing_count?: number | null
          host_name?: string | null
          host_response_rate?: number | null
          host_response_time?: string | null
          host_since?: string | null
          house_rules?: string | null
          id?: string
          instant_bookable?: boolean | null
          is_shared_bathroom?: boolean | null
          last_review_at?: string | null
          lat?: number | null
          lng?: number | null
          max_nights?: number | null
          min_nights?: number | null
          neighborhood_text?: string | null
          person_capacity?: number | null
          picture_count?: number | null
          picture_urls?: string[] | null
          property_type?: string | null
          provider: string
          rating_accuracy?: number | null
          rating_checkin?: number | null
          rating_cleanliness?: number | null
          rating_communication?: number | null
          rating_location?: number | null
          rating_overall?: number | null
          rating_value?: number | null
          raw?: Json
          review_count?: number | null
          reviews_fetched_at?: string | null
          reviews_per_month?: number | null
          room_type?: string | null
          space_text?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          amenities?: string[]
          bathrooms?: number | null
          bedrooms?: number | null
          beds?: number | null
          cancellation_policy?: string | null
          created_at?: string
          description?: string | null
          detail_fetched_at?: string | null
          external_id?: string
          first_review_at?: string | null
          geo?: unknown
          host_external_id?: string | null
          host_is_superhost?: boolean | null
          host_listing_count?: number | null
          host_name?: string | null
          host_response_rate?: number | null
          host_response_time?: string | null
          host_since?: string | null
          house_rules?: string | null
          id?: string
          instant_bookable?: boolean | null
          is_shared_bathroom?: boolean | null
          last_review_at?: string | null
          lat?: number | null
          lng?: number | null
          max_nights?: number | null
          min_nights?: number | null
          neighborhood_text?: string | null
          person_capacity?: number | null
          picture_count?: number | null
          picture_urls?: string[] | null
          property_type?: string | null
          provider?: string
          rating_accuracy?: number | null
          rating_checkin?: number | null
          rating_cleanliness?: number | null
          rating_communication?: number | null
          rating_location?: number | null
          rating_overall?: number | null
          rating_value?: number | null
          raw?: Json
          review_count?: number | null
          reviews_fetched_at?: string | null
          reviews_per_month?: number | null
          room_type?: string | null
          space_text?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
      }
      reviews: {
        Row: {
          comment: string | null
          created_at_source: string | null
          external_id: string | null
          id: string
          language: string | null
          listing_id: string
          rating: number | null
          tsv: unknown
        }
        Insert: {
          comment?: string | null
          created_at_source?: string | null
          external_id?: string | null
          id?: string
          language?: string | null
          listing_id: string
          rating?: number | null
          tsv?: unknown
        }
        Update: {
          comment?: string | null
          created_at_source?: string | null
          external_id?: string | null
          id?: string
          language?: string | null
          listing_id?: string
          rating?: number | null
          tsv?: unknown
        }
      }
      searches: {
        Row: {
          adults: number | null
          bbox: unknown
          check_in: string
          check_out: string
          children: number | null
          created_at: string
          currency: string
          guests: number
          id: string
          infants: number | null
          is_tracked: boolean
          label: string
          last_ingested_at: string | null
          location_query: string
          max_gross_nightly: number | null
          pets: number | null
        }
        Insert: {
          adults?: number | null
          bbox?: unknown
          check_in: string
          check_out: string
          children?: number | null
          created_at?: string
          currency?: string
          guests?: number
          id?: string
          infants?: number | null
          is_tracked?: boolean
          label: string
          last_ingested_at?: string | null
          location_query: string
          max_gross_nightly?: number | null
          pets?: number | null
        }
        Update: {
          adults?: number | null
          bbox?: unknown
          check_in?: string
          check_out?: string
          children?: number | null
          created_at?: string
          currency?: string
          guests?: number
          id?: string
          infants?: number | null
          is_tracked?: boolean
          label?: string
          last_ingested_at?: string | null
          location_query?: string
          max_gross_nightly?: number | null
          pets?: number | null
        }
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]

export type Listing = Tables<"listings">
export type ListingSnapshot = Tables<"listing_snapshots">
export type Search = Tables<"searches">
export type Review = Tables<"reviews">
export type Anchor = Tables<"anchors">
export type FilterSet = Tables<"filter_sets">
export type ListingVerdict = Tables<"listing_verdicts">
export type Alert = Tables<"alerts">
