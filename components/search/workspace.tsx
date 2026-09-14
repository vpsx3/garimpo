"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Coins,
  LayoutGrid,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnchorManager } from "@/components/geo/anchor-manager";
import { FilterPanel } from "@/components/results/filter-panel";
import { ResultsTable, type SortKey } from "@/components/results/table";
import { ResultCards } from "@/components/results/cards";
import { DetailDrawer } from "@/components/results/detail-drawer";
import { WeightsEditor } from "@/components/scoring/weights-editor";
import { SearchForm } from "./search-form";
import { PriceStep } from "./price-step";
import { postJson } from "@/lib/api";
import { applyFilter } from "@/lib/filters/apply";
import { withAnchorDistances } from "@/lib/search/pipeline";
import { scoreResults } from "@/lib/scoring/engine";
import type { FilterDefinition } from "@/lib/filters/types";
import type { ScoringWeights } from "@/lib/scoring/types";
import type { SearchQueryInput } from "@/lib/search/query";
import type { Anchor, Row, SearchResponse, Verdict } from "@/components/results/types";
import { cn } from "@/lib/utils";

const ResultsMap = dynamic(
  () => import("@/components/geo/results-map").then((mod) => mod.ResultsMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted" /> },
);

export function Workspace() {
  const [query, setQuery] = useState<SearchQueryInput | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<FilterDefinition>({});
  const [weights, setWeights] = useState<ScoringWeights>({});
  const [anchors, setAnchors] = useState<Anchor[]>([]);

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [orderBy, setOrderBy] = useState<SortKey>("effectiveNightly");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<"table" | "cards" | "map">("table");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<Row | null>(null);

  const search = useCallback(async (input: SearchQueryInput) => {
    setSearching(true);
    setError(null);
    setNotice(null);
    try {
      const response = await postJson<SearchResponse>("/api/search", input);
      setRows(response.rows);
      setQuery(input);
      setSearched(true);
      setSelected(new Set());
      if (response.fellBackTo) {
        setNotice("O adapter direto ficou obsoleto; a busca caiu para a Apify.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setRows([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // As âncoras entram como distâncias antes de qualquer filtro geográfico.
  const withDistances = useMemo(
    () => withAnchorDistances(rows, anchors),
    [rows, anchors],
  );

  const outcome = useMemo(
    () => applyFilter(withDistances, filter),
    [withDistances, filter],
  );

  const scoring = Object.keys(weights).length > 0;

  const visible = useMemo(() => {
    const scored = scoring
      ? (scoreResults(outcome.rows, weights, { sort: false }) as Row[])
      : outcome.rows;

    const direction = orderDir === "asc" ? 1 : -1;
    const key = scoring && orderBy === "effectiveNightly" ? "score" : orderBy;

    return [...scored].sort((a, b) => {
      const left = a[key as keyof Row] as number | null | undefined;
      const right = b[key as keyof Row] as number | null | undefined;
      // Sem valor vai sempre para o fim, independente da direção.
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      return (left - right) * (key === "score" ? -1 : direction);
    });
  }, [outcome.rows, weights, scoring, orderBy, orderDir]);

  const highlightTerms = useMemo(
    () => [
      ...(filter.reviewsIncludeTerms ?? []),
      ...(filter.reviewsExcludeTerms ?? []),
    ],
    [filter.reviewsIncludeTerms, filter.reviewsExcludeTerms],
  );

  const mergeRows = useCallback((updates: Map<string, Partial<Row>>) => {
    setRows((current) =>
      current.map((row) => {
        const update = updates.get(row.externalId);
        return update ? { ...row, ...update } : row;
      }),
    );
  }, []);

  function setVerdict(externalId: string, verdict: Verdict) {
    setRows((current) =>
      current.map((row) =>
        row.externalId === externalId ? { ...row, verdict } : row,
      ),
    );
    setOpenRow((current) =>
      current && current.externalId === externalId
        ? { ...current, verdict }
        : current,
    );
  }

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sort(key: SortKey) {
    if (orderBy === key) {
      setOrderDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(key);
      setOrderDir(key === "effectiveNightly" || key === "totalPrice" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchForm onSearch={search} pending={searching} />

      {notice ? (
        <p className="border-b bg-warning/10 px-4 py-1.5 text-[11px] text-warning">
          {notice}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "shrink-0 overflow-hidden border-r transition-all",
            panelOpen && searched ? "w-72" : "w-0",
          )}
        >
          {panelOpen && searched ? (
            <div className="flex h-full flex-col">
              <div className="shrink-0 px-3">
                <WeightsEditor weights={weights} onChange={setWeights} />
              </div>
              <div className="min-h-0 flex-1">
                <FilterPanel
                  filter={filter}
                  onChange={setFilter}
                  count={outcome.rows.length}
                  total={rows.length}
                  hasAnchors={anchors.length > 0}
                  anchorsSlot={
                    <div className="pb-3">
                      <AnchorManager anchors={anchors} onChange={setAnchors} compact />
                    </div>
                  }
                />
              </div>
            </div>
          ) : null}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {searched ? (
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
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
                  <TabsTrigger value="map">
                    <MapIcon className="h-3.5 w-3.5" />
                    Mapa
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex-1" />

              {query ? (
                <PriceStep
                  query={query}
                  rows={outcome.rows}
                  needsContent={
                    Boolean(filter.amenities) ||
                    highlightTerms.length > 0 ||
                    Boolean(filter.descriptionIncludeTerms?.length) ||
                    Boolean(filter.houseRulesExcludeTerms?.length)
                  }
                  onMerge={mergeRows}
                />
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">
            {error ? (
              <Card className="m-4 border-destructive/40">
                <CardContent className="space-y-1 p-4">
                  <p className="text-sm font-medium text-destructive">A busca falhou.</p>
                  <p className="font-mono text-xs text-muted-foreground">{error}</p>
                </CardContent>
              </Card>
            ) : null}

            {!searched && !error ? <Welcome /> : null}

            {searched && !error && rows.length === 0 && !searching ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                A origem não devolveu nenhum anúncio para esta busca.
              </p>
            ) : null}

            {searched && !error && rows.length > 0 && visible.length === 0 ? (
              <EmptyState outcome={outcome} />
            ) : null}

            {visible.length > 0 ? (
              view === "table" ? (
                <ResultsTable
                  rows={visible}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onOpen={setOpenRow}
                  orderBy={scoring && orderBy === "effectiveNightly" ? "score" : orderBy}
                  orderDir={orderDir}
                  onSort={sort}
                  hasScore={scoring}
                />
              ) : view === "cards" ? (
                <ResultCards rows={visible} onOpen={setOpenRow} />
              ) : (
                <div className="h-full min-h-96">
                  <ResultsMap rows={visible} anchors={anchors} onOpen={setOpenRow} />
                </div>
              )
            ) : null}
          </div>
        </section>
      </div>

      <DetailDrawer
        row={openRow}
        highlightTerms={highlightTerms}
        onClose={() => setOpenRow(null)}
        onVerdictChange={setVerdict}
      />
    </div>
  );
}

function Welcome() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h2 className="text-lg font-semibold tracking-tight">
        Os filtros do Airbnb são rasos. Estes não.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Faça uma busca acima. A consulta manda à origem só o que ela filtra bem —
        localização, datas, hóspedes — e todo o resto é aplicado aqui: sub-notas,
        lógica booleana de amenidades, texto das avaliações, distância a pontos
        que você escolhe, e o preço total real com limpeza e taxas diluídas pelas
        noites da estadia.
      </p>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Nada é salvo: sem login, sem histórico. Os resultados vivem enquanto a
        aba estiver aberta.
      </p>
    </div>
  );
}

/** Diz *qual* filtro zerou o resultado, não só que zerou. */
function EmptyState({ outcome }: { outcome: ReturnType<typeof applyFilter> }) {
  const tightest = [...outcome.perFilter]
    .sort((a, b) => a.survivors - b.survivors)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="text-sm font-medium">Nenhum anúncio passa por todos os filtros.</p>

      {outcome.culprits.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Sozinho,{" "}
          {outcome.culprits.length === 1 ? "este filtro já zera" : "estes filtros já zeram"}{" "}
          o resultado:{" "}
          <span className="font-medium text-foreground">
            {outcome.culprits.map((culprit) => culprit.label).join(", ")}
          </span>
          .
        </p>
      ) : tightest.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            Nenhum filtro zera sozinho — é a combinação. Os mais restritivos:
          </p>
          <ul className="mx-auto mt-2 w-fit space-y-0.5 text-left text-xs">
            {tightest.map((entry) => (
              <li key={entry.key} className="flex justify-between gap-6">
                <span className="text-muted-foreground">{entry.label}</span>
                <span className="tnum">
                  {entry.survivors} de {outcome.base}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-muted-foreground">
        <Coins className="mr-1 inline h-3 w-3" />
        Filtros de preço real só valem para anúncios já cotados.
      </p>
    </div>
  );
}
