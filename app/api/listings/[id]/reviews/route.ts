import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avaliações de um anúncio. Com `?terms=`, devolve só as que casam com os
 * termos — é o que alimenta os trechos destacados no drawer.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const terms = (url.searchParams.get("terms") ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const sql = await getSql();

  const reviews = terms.length
    ? await sql`
        select distinct r.id, r.comment, r.created_at_source, r.rating, r.language
        from reviews r, unnest(${terms}::text[]) as termo
        where r.listing_id = ${id}
          and r.tsv @@ plainto_tsquery('portuguese', termo)
        order by r.created_at_source desc nulls last
        limit 20
      `
    : await sql`
        select id, comment, created_at_source, rating, language
        from reviews
        where listing_id = ${id}
        order by created_at_source desc nulls last
        limit 20
      `;

  return NextResponse.json({ reviews, terms });
}
