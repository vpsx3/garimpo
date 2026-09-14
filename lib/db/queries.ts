import { getSql } from "@/lib/db/client";
import type { Anchor, Search } from "@/lib/db/types";

export type SearchListItem = Search & {
  listing_count: number;
  min_effective_nightly: number | null;
};

export async function listSearches(): Promise<SearchListItem[]> {
  const sql = await getSql();
  return sql<SearchListItem[]>`
    select
      s.*,
      (select count(distinct sn.listing_id)::int
        from listing_snapshots sn where sn.search_id = s.id) as listing_count,
      (select min(sn.effective_nightly)
        from listing_snapshots sn where sn.search_id = s.id) as min_effective_nightly
    from searches s
    order by s.created_at desc
  `;
}

export async function getSearch(id: string): Promise<Search | null> {
  const sql = await getSql();
  const [search] = await sql<Search[]>`select * from searches where id = ${id}`;
  return search ?? null;
}

export type AnchorRow = Omit<Anchor, "geo"> & { lat: number; lng: number };

export async function listAnchors(searchId: string): Promise<AnchorRow[]> {
  const sql = await getSql();
  return sql<AnchorRow[]>`
    select
      id, search_id, label, address, max_distance_m, weight, created_at,
      extensions.ST_Y(geo::extensions.geometry) as lat,
      extensions.ST_X(geo::extensions.geometry) as lng
    from anchors
    where search_id = ${searchId}
    order by created_at
  `;
}

export type FilterSetRow = {
  id: string;
  label: string;
  definition: unknown;
  scoring_weights: unknown;
  created_at: string;
};

export async function listFilterSets(): Promise<FilterSetRow[]> {
  const sql = await getSql();
  return sql<FilterSetRow[]>`
    select id, label, definition, scoring_weights, created_at
    from filter_sets
    order by created_at desc
  `;
}
