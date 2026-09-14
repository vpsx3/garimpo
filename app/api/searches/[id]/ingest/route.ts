import { NextResponse } from "next/server";
import { ingestSearch } from "@/lib/ingest/run";
import { ProviderStaleError, ProviderTransientError } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Dispara a Etapa A do pipeline para uma busca salva.
 *
 * Nenhuma chamada à origem parte do browser: tudo passa por aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const result = await ingestSearch(id, { limit });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderStaleError) {
      return NextResponse.json(
        {
          error: "provider_stale",
          detail: error.message,
          hint:
            "O adapter `direct` ficou obsoleto e não há APIFY_TOKEN configurado " +
            "para a queda automática.",
        },
        { status: 503 },
      );
    }
    if (error instanceof ProviderTransientError) {
      return NextResponse.json(
        { error: "provider_unavailable", detail: error.message },
        { status: 502 },
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    const notFound = detail.includes("não encontrada");
    return NextResponse.json(
      { error: notFound ? "not_found" : "ingest_failed", detail },
      { status: notFound ? 404 : 500 },
    );
  }
}
