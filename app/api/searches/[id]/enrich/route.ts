import { NextResponse } from "next/server";
import { enrichSearch } from "@/lib/ingest/enrich";
import { filterDefinitionSchema } from "@/lib/filters/types";
import { ProviderStaleError } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Etapas C/D/E do pipeline sobre o subconjunto que passou pelos filtros
 * baratos. O filtro enviado aqui é o mesmo da tela: enriquecer o que o
 * usuário está olhando, não o universo inteiro.
 */
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
    const result = await enrichSearch(id, {
      filter: filter.data,
      limit: typeof body?.limit === "number" ? body.limit : undefined,
      force: body?.force === true,
      steps: body?.steps,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderStaleError) {
      return NextResponse.json(
        { error: "provider_stale", detail: error.message },
        { status: 503 },
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "enrich_failed", detail },
      { status: detail.includes("não encontrada") ? 404 : 500 },
    );
  }
}
