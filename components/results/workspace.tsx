"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { postJson } from "@/lib/api";
import type { FilterDefinition } from "@/lib/filters/types";
import type { ScoringWeights } from "@/lib/scoring/types";
import { WeightsEditor } from "@/components/scoring/weights-editor";
import type { FilterSetRow } from "@/lib/db/queries";
import type { Search } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { FilterPanel } from "./filter-panel";
import { ResultsTable } from "./table";
import { ResultCards } from "./cards";
import { DetailDrawer } from "./detail-drawer";
import { EnrichButton } from "./enrich-button";
import type { EmptyDiagnosis, ResultRow, ResultsResponse } from "./types";

export function ResultsWorkspace({
  search,
  filterSets,
  hasAnchors,
}: {
  search: Search;
  filterSets: FilterSetRow[];
  hasAnchors: boolean;
}) {
  const [filter, setFilter] = useState<FilterDefinition>({});
  const [weights, setWeights] = useState<ScoringWeights>({});
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [diagnosis, setDiagnosis] = useState<EmptyDiagnosis | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orderBy, setOrderBy] = useState<string>("effective_nightly");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<"table" | "cards">("table");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<ResultRow | null>(null);
  const [sets, setSets] = useState(filterSets);

  const highlightTerms = useMemo(
    () => [
      ...(filter.reviewsIncludeTerms ?? []),
      ...(filter.reviewsExcludeTerms ?? []),
    ],
    [filter.reviewsIncludeTerms, filter.reviewsExcludeTerms],
  );

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await postJson<ResultsResponse>(
        `/api/searches/${search.id}/results`,
        {
          filter,
          orderBy,
          orderDir,
          weights: Object.keys(weights).length ? weights : undefined,
        },
      );
      setRows(response.results);
      setDiagnosis(response.diagnosis);
      setCount(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [search.id, filter, orderBy, orderDir, weights]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  // Ligar a pontuação troca a ordenação padrão para score (§9).
  useEffect(() => {
    setOrderBy((current) =>
      Object.keys(weights).length > 0 && current === "effective_nightly"
        ? "score"
        : current,
    );
  }, [weights]);

  // Contador ao vivo com debounce de 300ms: o painel responde a cada tecla
  // sem disparar uma consulta a cada tecla.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCounting(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { total } = await postJson<{ total: number }>(
          `/api/searches/${search.id}/count`,
          { filter },
        );
        setCount(total);
      } catch {
        // O contador é acessório: falha nele não atrapalha a tabela.
      } finally {
        setCounting(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search.id, filter]);

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  const scoring = Object.keys(weights).length > 0;

  function sort(key: string) {
    if (orderBy === key) {
      setOrderDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(key);
      setOrderDir(key === "effective_nightly" ? "asc" : "desc");
    }
  }

  async function saveFilterSet(label: string) {
    const { filterSet } = await postJson<{ filterSet: FilterSetRow }>(
      "/api/filter-sets",
      {
        label,
        definition: filter,
        scoringWeights: Object.keys(weights).length ? weights : null,
      },
    );
    setSets((current) => [filterSet, ...current]);
  }

  function loadFilterSet(id: string) {
    const found = sets.find((set) => set.id === id);
    if (!found) return;
    setFilter(found.definition as FilterDefinition);
    setWeights((found.scoring_weights as ScoringWeights) ?? {});
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          "shrink-0 overflow-hidden border-r transition-all",
          panelOpen ? "w-72" : "w-0",
        )}
      >
        {panelOpen ? (
          <div className="flex h-full flex-col">
            <div className="shrink-0 px-3">
              <WeightsEditor weights={weights} onChange={setWeights} />
            </div>
            <div className="min-h-0 flex-1">
          <FilterPanel
            filter={filter}
            onChange={setFilter}
            count={count}
            counting={counting}
            filterSets={sets}
            onSaveFilterSet={saveFilterSet}
            onLoadFilterSet={loadFilterSet}
            hasAnchors={hasAnchors}
          />
            </div>
          </div>
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setPanelOpen((open) => !open)}
            aria-label={panelOpen ? "Fechar filtros" : "Abrir filtros"}
          >
            {panelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <Tabs value={view} onValueChange={(value) => setView(value as "table")}>
            <TabsList>
              <TabsTrigger value="table">
                <Rows3 className="h-3.5 w-3.5" />
                Tabela
              </TabsTrigger>
              <TabsTrigger value="cards">
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1" />

          <EnrichButton
            searchId={search.id}
            filter={filter}
            onDone={() => void loadResults()}
          />

          {selected.size > 0 ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/search/${search.id}/compare?ids=${[...selected].join(",")}`}
              >
                Comparar {selected.size}
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="flex-1 overflow-auto">
          {error ? (
            <Card className="m-4 border-destructive/40">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm font-medium text-destructive">
                  A consulta falhou.
                </p>
                <p className="font-mono text-xs text-muted-foreground">{error}</p>
              </CardContent>
            </Card>
          ) : null}

          {!error && loading ? (
            <p className="p-6 text-sm text-muted-foreground">Consultando…</p>
          ) : null}

          {!error && !loading && rows.length === 0 ? (
            <EmptyState diagnosis={diagnosis} searchId={search.id} />
          ) : null}

          {!error && !loading && rows.length > 0 ? (
            view === "table" ? (
              <ResultsTable
                rows={rows}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpen={setOpenRow}
                orderBy={orderBy}
                orderDir={orderDir}
                onSort={sort}
                hasScore={scoring}
              />
            ) : (
              <ResultCards rows={rows} onOpen={setOpenRow} />
            )
          ) : null}
        </div>
      </section>

      <DetailDrawer
        row={openRow}
        highlightTerms={highlightTerms}
        onClose={() => setOpenRow(null)}
        onVerdictChange={(listingId, verdict, note) => {
          setRows((current) =>
            current.map((row) =>
              row.id === listingId
                ? { ...row, verdict, verdict_note: note }
                : row,
            ),
          );
          setOpenRow((current) =>
            current && current.id === listingId
              ? { ...current, verdict, verdict_note: note }
              : current,
          );
        }}
      />
    </div>
  );
}

/**
 * Estado vazio que diz *qual* filtro zerou o resultado. "Nenhum resultado"
 * sozinho obriga o usuário a desligar filtros um por um até descobrir.
 */
function EmptyState({
  diagnosis,
  searchId,
}: {
  diagnosis: EmptyDiagnosis | null;
  searchId: string;
}) {
  if (diagnosis && diagnosis.base === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-medium">Esta busca ainda não tem anúncios.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Rode uma ingestão para popular o cache local.
        </p>
        <Button size="sm" className="mt-4" asChild>
          <Link href={`/`}>Voltar e ingerir</Link>
        </Button>
      </div>
    );
  }

  const culprits = diagnosis?.culprits ?? [];
  const tightest = [...(diagnosis?.perFilter ?? [])]
    .sort((a, b) => a.survivors - b.survivors)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="text-sm font-medium">Nenhum anúncio passa por todos os filtros.</p>

      {culprits.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Sozinho, {culprits.length === 1 ? "este filtro já zera" : "estes filtros já zeram"}{" "}
          o resultado:{" "}
          <span className="font-medium text-foreground">
            {culprits.map((c) => c.label).join(", ")}
          </span>
          .
        </p>
      ) : tightest.length > 0 ? (
        <div className="mt-3 space-y-1 text-left text-xs">
          <p className="text-center text-sm text-muted-foreground">
            Nenhum filtro zera sozinho — é a combinação. Os mais restritivos:
          </p>
          <ul className="mx-auto mt-2 w-fit space-y-0.5">
            {tightest.map((entry) => (
              <li key={entry.key} className="flex justify-between gap-6">
                <span className="text-muted-foreground">{entry.label}</span>
                <span className="tnum">{entry.survivors} de {diagnosis?.base}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Busca {searchId.slice(0, 8)} · {diagnosis?.base ?? 0} anúncios no cache.
      </p>
    </div>
  );
}
