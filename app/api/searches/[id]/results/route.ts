import { NextResponse } from "next/server";
import { ORDER_KEYS, type OrderKey } from "@/lib/filters/build";
import { diagnoseEmpty, runFilterQuery } from "@/lib/filters/run";
import { filterDefinitionSchema } from "@/lib/filters/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const requestedOrder = body?.orderBy as OrderKey | undefined;
  const orderBy: OrderKey = ORDER_KEYS.includes(requestedOrder as OrderKey)
    ? (requestedOrder as OrderKey)
    : "effective_nightly";

  try {
    const rows = await runFilterQuery({
      searchId: id,
      filter: filter.data,
      orderBy,
      orderDir: body?.orderDir === "desc" ? "desc" : "asc",
      limit: body?.limit,
      offset: body?.offset,
    });

    // Resultado vazio precisa dizer *qual* filtro zerou, não só "nada aqui".
    const diagnosis = rows.length === 0 ? await diagnoseEmpty(id, filter.data) : null;

    return NextResponse.json({ results: rows, total: rows.length, diagnosis });
  } catch (error) {
    return NextResponse.json(
      {
        error: "query_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
