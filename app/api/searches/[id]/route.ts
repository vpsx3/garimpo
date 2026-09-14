import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { searchInputSchema } from "@/lib/searches/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = await getSql();
  const [search] = await sql`select * from searches where id = ${id}`;
  if (!search) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ search });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = searchInputSchema.partial().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const sql = await getSql();
  const [search] = await sql`
    update searches set
      label = coalesce(${input.label ?? null}, label),
      location_query = coalesce(${input.locationQuery ?? null}, location_query),
      check_in = coalesce(${input.checkIn ?? null}, check_in),
      check_out = coalesce(${input.checkOut ?? null}, check_out),
      guests = coalesce(${input.guests ?? null}, guests),
      max_gross_nightly = ${input.maxGrossNightly ?? null},
      is_tracked = coalesce(${input.isTracked ?? null}, is_tracked)
    where id = ${id}
    returning *
  `;

  if (!search) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ search });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = await getSql();
  await sql`delete from searches where id = ${id}`;
  return NextResponse.json({ ok: true });
}
