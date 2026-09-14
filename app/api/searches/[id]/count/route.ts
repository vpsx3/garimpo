import { NextResponse } from "next/server";
import { countMatches } from "@/lib/filters/run";
import { filterDefinitionSchema } from "@/lib/filters/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contador ao vivo do painel de filtros. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const filter = filterDefinitionSchema.safeParse(body?.filter ?? {});

  if (!filter.success) {
    return NextResponse.json(
      { error: "invalid_filter", issues: filter.error.issues },
      { status: 422 },
    );
  }

  try {
    return NextResponse.json({ total: await countMatches(id, filter.data) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "count_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
