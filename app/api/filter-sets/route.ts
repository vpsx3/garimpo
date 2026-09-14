import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { filterDefinitionSchema } from "@/lib/filters/types";
import { scoringWeightsSchema } from "@/lib/scoring/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  definition: filterDefinitionSchema,
  scoringWeights: scoringWeightsSchema.nullish(),
});

export async function GET() {
  const sql = await getSql();
  const filterSets = await sql`
    select id, label, definition, scoring_weights, created_at
    from filter_sets order by created_at desc
  `;
  return NextResponse.json({ filterSets });
}

export async function POST(request: Request) {
  const parsed = filterSetSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const sql = await getSql();
  const [filterSet] = await sql`
    insert into filter_sets (label, definition, scoring_weights)
    values (
      ${parsed.data.label},
      ${sql.json(parsed.data.definition as never)},
      ${parsed.data.scoringWeights ? sql.json(parsed.data.scoringWeights as never) : null}
    )
    returning id, label, definition, scoring_weights, created_at
  `;

  return NextResponse.json({ filterSet }, { status: 201 });
}
