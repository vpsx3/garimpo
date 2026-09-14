import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { listAnchors } from "@/lib/db/queries";
import { geocode } from "@/lib/geo/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anchorSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    address: z.string().trim().min(3).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    maxDistanceM: z.number().int().positive().max(200_000).nullish(),
    weight: z.number().min(0).max(10).default(0),
  })
  .refine(
    (value) =>
      (value.lat !== null && value.lat !== undefined && value.lng !== null && value.lng !== undefined) ||
      Boolean(value.address),
    { message: "Informe um endereço ou uma coordenada." },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json({ anchors: await listAnchors(id) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = anchorSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  let displayName: string | null = null;

  if ((lat === null || lng === null) && input.address) {
    try {
      const geocoded = await geocode(input.address);
      if (!geocoded) {
        return NextResponse.json(
          { error: "geocode_not_found", detail: `Nada encontrado para "${input.address}".` },
          { status: 422 },
        );
      }
      lat = geocoded.lat;
      lng = geocoded.lng;
      displayName = geocoded.displayName;
    } catch (error) {
      return NextResponse.json(
        {
          error: "geocode_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 502 },
      );
    }
  }

  const sql = await getSql();
  const [anchor] = await sql`
    insert into anchors (search_id, label, address, geo, max_distance_m, weight)
    values (
      ${id}, ${input.label}, ${displayName ?? input.address ?? null},
      extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}, ${lat}), 4326)::extensions.geography,
      ${input.maxDistanceM ?? null}, ${input.weight}
    )
    returning
      id, search_id, label, address, max_distance_m, weight, created_at,
      extensions.ST_Y(geo::extensions.geometry) as lat,
      extensions.ST_X(geo::extensions.geometry) as lng
  `;

  return NextResponse.json({ anchor }, { status: 201 });
}
