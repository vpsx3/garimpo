import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { searchInputSchema } from "@/lib/searches/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = await getSql();
  const searches = await sql`
    select
      s.*,
      (select count(distinct sn.listing_id)
        from listing_snapshots sn where sn.search_id = s.id) as listing_count,
      (select min(sn.effective_nightly)
        from listing_snapshots sn where sn.search_id = s.id) as min_effective_nightly
    from searches s
    order by s.created_at desc
  `;
  return NextResponse.json({ searches });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = searchInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const sql = await getSql();
  const [search] = await sql`
    insert into searches (
      label, location_query, check_in, check_out, guests,
      adults, children, infants, pets, max_gross_nightly, currency, is_tracked
    ) values (
      ${input.label}, ${input.locationQuery}, ${input.checkIn}, ${input.checkOut},
      ${input.guests}, ${input.adults ?? null}, ${input.children ?? null},
      ${input.infants ?? null}, ${input.pets ?? null},
      ${input.maxGrossNightly ?? null}, ${input.currency}, ${input.isTracked}
    )
    returning *
  `;

  return NextResponse.json({ search }, { status: 201 });
}
