"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { applyDetail, applyQuote } from "@/lib/search/pipeline";
import type { QuoteResult } from "@/app/api/quotes/route";
import type { Row } from "@/components/results/types";
import type { SearchQueryInput } from "@/lib/search/query";

/** Lote por requisição. A rota tem orçamento de 50s a 1 req/s. */
const BATCH = 10;

export type ContentProgress = {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
};

/**
 * Carrega descrição e amenidades dos anúncios, em lotes.
 *
 * Existe porque a busca não traz esse conteúdo: ela só tem nome, bairro,
 * quartos e camas. Como o filtro de palavra-chave é estrito — anúncio sem a
 * palavra não é listado —, filtrar antes de carregar esconderia anúncios por
 * falta de dado em vez de por falta da amenidade. Daí o carregamento começar
 * sozinho quando há palavra-chave ativa.
 *
 * Os lotes são pequenos de propósito: a lista se preenche progressivamente em
 * vez de ficar parada 40 segundos.
 */
export function useContentLoader(
  onMerge: (updates: Map<string, Partial<Row>>) => void,
) {
  const [progress, setProgress] = useState<ContentProgress>({
    running: false,
    done: 0,
    total: 0,
    error: null,
  });

  // Guarda quem já foi pedido, para um re-render não repetir a chamada.
  const pedidos = useRef(new Set<string>());
  const cancelado = useRef(false);

  const reset = useCallback(() => {
    pedidos.current.clear();
    cancelado.current = false;
    setProgress({ running: false, done: 0, total: 0, error: null });
  }, []);

  const cancel = useCallback(() => {
    cancelado.current = true;
    setProgress((current) => ({ ...current, running: false }));
  }, []);

  const load = useCallback(
    async (query: SearchQueryInput, rows: Row[], withPrice: boolean) => {
      const pendentes = rows.filter(
        (row) => !pedidos.current.has(row.externalId),
      );
      if (pendentes.length === 0) return;

      cancelado.current = false;
      setProgress({ running: true, done: 0, total: pendentes.length, error: null });

      for (const row of pendentes) pedidos.current.add(row.externalId);

      const porId = new Map(rows.map((row) => [row.externalId, row]));
      let feitos = 0;

      for (let i = 0; i < pendentes.length; i += BATCH) {
        if (cancelado.current) break;
        const lote = pendentes.slice(i, i + BATCH);

        try {
          const response = await postJson<{ results: QuoteResult[]; stale: boolean }>(
            "/api/quotes",
            {
              externalIds: lote.map((row) => row.externalId),
              checkIn: query.checkIn,
              checkOut: query.checkOut,
              guests: query.guests,
              steps: { quote: withPrice, detail: true, reviews: false },
            },
          );

          const updates = new Map<string, Partial<Row>>();
          for (const result of response.results) {
            const base = porId.get(result.externalId);
            if (!base) continue;
            let next = base;
            if (result.quote) next = applyQuote(next, result.quote);
            if (result.detail) next = applyDetail(next, result.detail);
            if (result.unavailable) next = { ...next, isAvailable: false };
            updates.set(result.externalId, next);
          }
          onMerge(updates);

          feitos += response.results.length;
          setProgress((current) => ({ ...current, done: feitos }));

          if (response.stale) {
            setProgress((current) => ({
              ...current,
              running: false,
              error: "A origem mudou de formato; o carregamento parou.",
            }));
            return;
          }
        } catch (error) {
          setProgress((current) => ({
            ...current,
            running: false,
            error: error instanceof Error ? error.message : String(error),
          }));
          return;
        }
      }

      setProgress((current) => ({ ...current, running: false }));
    },
    [onMerge],
  );

  return { progress, load, reset, cancel };
}
