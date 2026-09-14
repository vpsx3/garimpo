import type { Sql } from "postgres";
import { getSql } from "@/lib/db/client";
import { createProvider } from "@/lib/providers";
import type { SearchQuery } from "@/lib/providers/types";
import type { Search } from "@/lib/db/types";
import { breakdownFromListing, nightsBetween } from "./price";
import { insertSnapshot, upsertListings } from "./persist";

/**
 * Etapa A do pipeline: uma chamada à origem, ~50–300 resultados.
 *
 * A consulta remota usa **apenas** o que a origem suporta bem — localização,
 * datas, hóspedes e teto de preço bruto. Nenhum dos filtros de §7 chega aqui:
 * todos rodam em SQL depois. É essa separação que permite qualquer combinação
 * de filtro sem depender do que a origem oferece.
 */

export type IngestResult = {
  searchId: string;
  provider: string;
  fetched: number;
  upserted: number;
  snapshots: number;
  withoutPrice: number;
  fellBackTo: string | null;
  durationMs: number;
};

export async function loadSearch(sql: Sql, searchId: string): Promise<Search | null> {
  const [search] = await sql<Search[]>`
    select * from searches where id = ${searchId}
  `;
  return search ?? null;
}

export function searchToQuery(search: Search, limit = 300): SearchQuery {
  return {
    locationQuery: search.location_query,
    checkIn: search.check_in,
    checkOut: search.check_out,
    guests: search.guests,
    adults: search.adults,
    children: search.children,
    infants: search.infants,
    pets: search.pets,
    maxGrossNightly: search.max_gross_nightly,
    currency: search.currency,
    limit,
  };
}

export async function ingestSearch(
  searchId: string,
  options: { limit?: number } = {},
): Promise<IngestResult> {
  const startedAt = Date.now();
  const sql = await getSql();

  const search = await loadSearch(sql, searchId);
  if (!search) throw new Error(`Busca ${searchId} não encontrada.`);

  const provider = createProvider();
  const nights = nightsBetween(search.check_in, search.check_out);

  const listings = await provider.searchStays(searchToQuery(search, options.limit));
  const upserted = await upsertListings(sql, provider.name.split("+")[0], listings);

  const byExternalId = new Map(upserted.map((row) => [row.externalId, row.id]));

  let snapshots = 0;
  let withoutPrice = 0;

  for (const listing of listings) {
    const listingId = byExternalId.get(listing.externalId);
    if (!listingId) continue;

    const breakdown = breakdownFromListing(listing, {
      guests: search.guests,
      nights,
      currency: search.currency,
    });

    // Um anúncio sem preço legível ainda entra no cache: o enriquecimento
    // (Etapa C) busca a cotação real depois. O que não dá é inventar número.
    if (!breakdown) {
      withoutPrice++;
      continue;
    }

    await insertSnapshot(sql, {
      listingId,
      searchId,
      breakdown,
      raw: listing.price ?? null,
    });
    snapshots++;
  }

  await sql`update searches set last_ingested_at = now() where id = ${searchId}`;

  return {
    searchId,
    provider: provider.name,
    fetched: listings.length,
    upserted: upserted.length,
    snapshots,
    withoutPrice,
    fellBackTo: provider.lastFallbackReason,
    durationMs: Date.now() - startedAt,
  };
}
