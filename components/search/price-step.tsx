"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api";
import { applyDetail, applyQuote } from "@/lib/search/pipeline";
import type { QuoteResult } from "@/app/api/quotes/route";
import type { Row } from "@/components/results/types";
import type { SearchQueryInput } from "@/lib/search/query";

/** Teto por lote. Acima disso a rota esbarra no limite de tempo da Vercel. */
const BATCH = 40;

/**
 * Passo 2 do fluxo: o preço real, sob demanda.
 *
 * Roda só sobre o que sobrou dos filtros. Uma chamada por anúncio, a 1 req/s —
 * por isso é um botão e não algo automático: em 30 anúncios são ~30 segundos,
 * e fazer isso a cada busca tornaria a ferramenta insuportável.
 */
export function PriceStep({
  query,
  rows,
  needsContent,
  onMerge,
}: {
  query: SearchQueryInput;
  rows: Row[];
  needsContent: boolean;
  onMerge: (updates: Map<string, Partial<Row>>) => void;
}) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const pendentes = rows.filter((row) => row.priceSource === "search");
  const alvo = pendentes.slice(0, BATCH);

  async function run() {
    if (alvo.length === 0) return;
    setPending(true);
    setProgress(`Consultando ${alvo.length} anúncios…`);

    try {
      const response = await postJson<{
        results: QuoteResult[];
        remaining: string[];
        stale: boolean;
        detail?: string;
      }>("/api/quotes", {
        externalIds: alvo.map((row) => row.externalId),
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        guests: query.guests,
        steps: { quote: true, detail: needsContent, reviews: needsContent },
      });

      const byId = new Map(rows.map((row) => [row.externalId, row]));
      const updates = new Map<string, Partial<Row>>();

      for (const result of response.results) {
        const base = byId.get(result.externalId);
        if (!base) continue;

        let next = base;
        if (result.quote) next = applyQuote(next, result.quote);
        if (result.detail) next = applyDetail(next, result.detail);
        if (result.reviews) {
          next = {
            ...next,
            reviews: result.reviews
              .filter((review) => review.comment)
              .map((review) => ({
                comment: review.comment!,
                createdAt: review.createdAt ?? null,
                rating: review.rating ?? null,
              })),
          };
        }
        if (result.unavailable) next = { ...next, isAvailable: false };

        updates.set(result.externalId, next);
      }

      onMerge(updates);

      const feitos = response.results.length;
      const sobraram = pendentes.length - feitos;
      setProgress(
        response.stale
          ? `A origem mudou de formato; ${feitos} cotados antes de parar.`
          : sobraram > 0
            ? `${feitos} cotados · ${sobraram} ainda sem preço real`
            : `${feitos} cotados`,
      );
    } catch (error) {
      setProgress(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {progress ? (
        <span className="max-w-72 truncate text-[11px] text-muted-foreground">
          {progress}
        </span>
      ) : null}
      <Button size="sm" onClick={run} disabled={pending || alvo.length === 0}>
        <Coins className="h-3.5 w-3.5" />
        {pending
          ? "Cotando…"
          : alvo.length === 0
            ? "Todos cotados"
            : `Calcular preço real (${alvo.length})`}
      </Button>
    </div>
  );
}
