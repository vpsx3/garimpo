import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(120).nullish(),
  maxDistanceM: z.number().int().positive().max(200_000).nullish(),
  weight: z.number().min(0).max(10).nullish(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const sql = await getSql();
  const [anchor] = await sql`
    update anchors set
      label = coalesce(${parsed.data.label ?? null}, label),
      max_distance_m = ${parsed.data.maxDistanceM ?? null},
      weight = coalesce(${parsed.data.weight ?? null}, weight)
    where id = ${id}
    returning
      id, search_id, label, address, max_distance_m, weight, created_at,
      extensions.ST_Y(geo::extensions.geometry) as lat,
      extensions.ST_X(geo::extensions.geometry) as lng
  `;

  if (!anchor) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ anchor });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = await getSql();
  await sql`delete from anchors where id = ${id}`;
  return NextResponse.json({ ok: true });
}
