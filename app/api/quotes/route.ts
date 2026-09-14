import { NextResponse } from "next/server";
import { z } from "zod";
import { createProvider } from "@/lib/providers";
import {
  ListingUnavailableError,
  ProviderStaleError,
} from "@/lib/providers/types";
import type { RawListingDetail, RawPriceQuote, RawReview } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Margem antes do teto da rota, para responder o parcial em vez de morrer. */
const TIME_BUDGET_MS = 50_000;

const quotesSchema = z.object({
  externalIds: z.array(z.string().min(1)).min(1).max(60),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(16),
  steps: z
    .object({
      quote: z.boolean().default(true),
      detail: z.boolean().default(false),
      reviews: z.boolean().default(false),
    })
    .default({ quote: true, detail: false, reviews: false }),
  reviewLimit: z.number().int().min(1).max(50).default(30),
});

export type QuoteResult = {
  externalId: string;
  quote: RawPriceQuote | null;
  detail: RawListingDetail | null;
  reviews: RawReview[] | null;
  unavailable: boolean;
  error: string | null;
};

/**
 * Passo 2: o preço real, sob demanda.
 *
 * Caro por construção — uma chamada por anúncio, por etapa, serializadas pelo
 * rate limiter. Por isso roda só sobre o que sobrou dos filtros, e por isso
 * respeita um orçamento de tempo: ao se aproximar do teto da rota, devolve o
 * que já tem com `remaining` preenchido, em vez de estourar e perder tudo.
 */
export async function POST(request: Request) {
  const parsed = quotesSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const provider = createProvider();
  const startedAt = Date.now();

  const results: QuoteResult[] = [];
  const remaining: string[] = [];

  for (const [index, externalId] of input.externalIds.entries()) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      remaining.push(...input.externalIds.slice(index));
      break;
    }

    const result: QuoteResult = {
      externalId,
      quote: null,
      detail: null,
      reviews: null,
      unavailable: false,
      error: null,
    };

    try {
      if (input.steps.quote) {
        result.quote = await provider.getPriceQuote(externalId, {
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.guests,
        });
      }
      if (input.steps.detail) {
        result.detail = await provider.getListingDetail(externalId);
      }
      if (input.steps.reviews) {
        result.reviews = await provider.getReviews(externalId, input.reviewLimit);
      }
    } catch (error) {
      // Obsolescência do provider interrompe o lote: insistir anúncio a
      // anúncio contra uma origem que mudou só gasta cota.
      if (error instanceof ProviderStaleError) {
        remaining.push(...input.externalIds.slice(index));
        results.push({ ...result, error: error.message });
        return NextResponse.json({
          results,
          remaining,
          stale: true,
          detail: error.message,
        });
      }
      if (error instanceof ListingUnavailableError) {
        result.unavailable = true;
      } else {
        result.error = error instanceof Error ? error.message : String(error);
      }
    }

    results.push(result);
  }

  return NextResponse.json({
    results,
    remaining,
    stale: false,
    provider: provider.name,
    fellBackTo: provider.lastFallbackReason,
    durationMs: Date.now() - startedAt,
  });
}
