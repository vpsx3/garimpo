import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeRead = url.searchParams.get("all") === "1";
  const sql = await getSql();

  const alerts = await sql`
    select
      a.id, a.kind, a.payload, a.created_at, a.read_at,
      a.search_id, a.listing_id,
      s.label as search_label, s.currency,
      l.title, l.url, l.rating_overall, l.review_count
    from alerts a
    left join searches s on s.id = a.search_id
    left join listings l on l.id = a.listing_id
    ${includeRead ? sql`` : sql`where a.read_at is null`}
    order by a.created_at desc
    limit 200
  `;

  return NextResponse.json({ alerts });
}

/** Marca alertas como lidos. Sem ids, marca todos. */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : null;
  const sql = await getSql();

  if (ids && ids.length > 0) {
    await sql`update alerts set read_at = now() where id = any(${ids}::uuid[]) and read_at is null`;
  } else {
    await sql`update alerts set read_at = now() where read_at is null`;
  }

  return NextResponse.json({ ok: true });
}
