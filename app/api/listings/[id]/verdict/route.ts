import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verdictSchema = z.object({
  verdict: z.enum(["shortlist", "rejected", "seen"]),
  note: z.string().max(2000).nullish(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = verdictSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const sql = await getSql();
  const [verdict] = await sql`
    insert into listing_verdicts (listing_id, verdict, note)
    values (${id}, ${parsed.data.verdict}, ${parsed.data.note ?? null})
    on conflict (listing_id) do update set
      verdict = excluded.verdict,
      note = excluded.note,
      updated_at = now()
    returning *
  `;

  return NextResponse.json({ verdict });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = await getSql();
  await sql`delete from listing_verdicts where listing_id = ${id}`;
  return NextResponse.json({ ok: true });
}
