"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api";
import type { FilterDefinition } from "@/lib/filters/types";
import type { EnrichResult } from "@/lib/ingest/enrich";

/**
 * Dispara o enriquecimento do subconjunto visível. Caro por construção: uma
 * chamada à origem por anúncio, por etapa, serializadas pelo rate limiter.
 */
export function EnrichButton({
  searchId,
  filter,
  onDone,
}: {
  searchId: string;
  filter: FilterDefinition;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function enrich() {
    setPending(true);
    setSummary(null);
    try {
      const result = await postJson<EnrichResult>(
        `/api/searches/${searchId}/enrich`,
        { filter },
      );
      setSummary(
        `${result.quotes.fetched} cotações · ${result.details.fetched} detalhes · ` +
          `${result.reviews.inserted} avaliações` +
          (result.unavailable ? ` · ${result.unavailable} indisponíveis` : ""),
      );
      onDone();
    } catch (error) {
      setSummary(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={enrich} disabled={pending}>
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Enriquecendo…" : "Enriquecer visíveis"}
      </Button>
      {summary ? (
        <span className="max-w-72 truncate text-[11px] text-muted-foreground">
          {summary}
        </span>
      ) : null}
    </div>
  );
}
