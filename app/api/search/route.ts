import { NextResponse } from "next/server";
import { createProvider } from "@/lib/providers";
import { ProviderStaleError, ProviderTransientError } from "@/lib/providers/types";
import { searchQuerySchema } from "@/lib/search/query";
import { toRow } from "@/lib/search/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Passo 1: uma única chamada à origem.
 *
 * Volta em segundos com a diária anunciada. Nenhum filtro de §7 é enviado à
 * origem — todos rodam no cliente, sobre estas linhas. O preço real é o passo
 * 2, sob demanda, porque custa uma chamada por anúncio.
 */
export async function POST(request: Request) {
  const parsed = searchQuerySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const provider = createProvider();

  try {
    const listings = await provider.searchStays({
      locationQuery: input.locationQuery,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      adults: input.guests,
      maxGrossNightly: input.maxGrossNightly,
      currency: input.currency,
      limit: input.limit,
    });

    const rows = listings.map((listing) =>
      toRow(listing, {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        currency: input.currency,
      }),
    );

    return NextResponse.json({
      rows,
      provider: provider.name,
      fellBackTo: provider.lastFallbackReason,
      query: input,
    });
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
    return NextResponse.json(
      {
        error: "search_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
