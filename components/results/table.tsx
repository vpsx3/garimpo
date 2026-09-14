"use client";

import { ArrowDown, ArrowUp, ExternalLink, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRating,
} from "@/lib/format";
import { hasContent, matchedKeywords } from "@/lib/filters/apply";
import type { Row } from "./types";
import { ScoreCell } from "@/components/scoring/score-cell";

export type SortKey =
  | "score"
  | "effectiveNightly"
  | "totalPrice"
  | "ratingOverall"
  | "reviewCount"
  | "minAnchorDistanceM"
  | "beds"
  | "cleaningFee"
  | "cleaningRatio";

type Column = {
  key: SortKey | "anchors" | "link";
  label: string;
  hint?: string;
  align?: "left" | "right";
  sortable?: boolean;
};

const COLUMNS: Column[] = [
  { key: "score", label: "Score", align: "right", sortable: true },
  {
    key: "effectiveNightly",
    label: "Diária efetiva",
    hint: "Total da estadia dividido pelas noites — inclui limpeza, serviço e impostos. Só existe depois de calcular o preço real.",
    align: "right",
    sortable: true,
  },
  { key: "totalPrice", label: "Total", align: "right", sortable: true },
  { key: "ratingOverall", label: "Nota", align: "right", sortable: true },
  { key: "reviewCount", label: "Aval.", align: "right", sortable: true },
  { key: "anchors", label: "Distância", align: "right" },
  { key: "beds", label: "Camas", align: "right", sortable: true },
  { key: "cleaningFee", label: "Limpeza", align: "right", sortable: true },
  {
    key: "cleaningRatio",
    label: "% limp.",
    hint: "Quanto do total é taxa de limpeza.",
    align: "right",
    sortable: true,
  },
  { key: "link", label: "", align: "right" },
];

export function ResultsTable({
  rows,
  selected,
  onToggleSelect,
  onOpen,
  orderBy,
  orderDir,
  onSort,
  hasScore,
  keywords = [],
}: {
  rows: Row[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (row: Row) => void;
  orderBy: string;
  orderDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  hasScore: boolean;
  keywords?: string[];
}) {
  const columns = hasScore ? COLUMNS : COLUMNS.filter((column) => column.key !== "score");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="w-8 px-2 py-2" />
            <th className="px-2 py-2 text-left font-medium">Anúncio</th>
            {columns.map((column) => (
              <th
                key={column.key}
                title={column.hint}
                className={cn(
                  "whitespace-nowrap px-2 py-2 font-medium",
                  column.align === "right" ? "text-right" : "text-left",
                  column.sortable && "cursor-pointer select-none hover:text-foreground",
                )}
                onClick={column.sortable ? () => onSort(column.key as SortKey) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {column.label}
                  {orderBy === column.key ? (
                    orderDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.externalId}
              className={cn(
                "border-b transition-colors hover:bg-accent/40",
                row.verdict === "rejected" && "opacity-45",
                row.verdict === "shortlist" && "bg-success/5",
              )}
            >
              <td className="px-2 py-1.5 align-middle">
                <Checkbox
                  checked={selected.has(row.externalId)}
                  onCheckedChange={() => onToggleSelect(row.externalId)}
                  aria-label="Selecionar para comparação"
                />
              </td>

              <td className="max-w-80 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="block w-full truncate text-left font-medium hover:underline"
                >
                  {row.title ?? `Anúncio ${row.externalId}`}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span>{roomTypeLabel(row.roomType)}</span>
                  {row.isSuperhost ? <Badge variant="warning">superhost</Badge> : null}
                  {row.priceSource === "search" ? (
                    <Badge
                      variant="outline"
                      title="Preço estimado da busca. Calcule o preço real para incluir limpeza, serviço e impostos."
                    >
                      estimado
                    </Badge>
                  ) : null}
                  <KeywordBadges row={row} keywords={keywords} />
                  {!row.isAvailable ? (
                    <Badge variant="destructive">indisponível</Badge>
                  ) : null}
                </div>
              </td>

              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "tnum whitespace-nowrap px-2 py-1.5",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {renderCell(column.key, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(key: Column["key"], row: Row) {
  switch (key) {
    case "score":
      return row.score === undefined ? (
        "—"
      ) : (
        <ScoreCell
          score={row.score}
          breakdown={row.score_breakdown as never}
        />
      );

    case "effectiveNightly":
      // O contraste entre a diária efetiva e a anunciada é o argumento de
      // venda do produto: as duas aparecem sempre lado a lado.
      return (
        <div className="flex items-baseline justify-end gap-1.5">
          <span className={cn("font-medium", row.priceSource === "quote" && "text-success")}>
            {formatMoney(row.effectiveNightly, row.currency, { compact: true })}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatMoney(row.grossNightly, row.currency, { compact: true })}
          </span>
        </div>
      );

    case "totalPrice":
      return formatMoney(row.totalPrice, row.currency, { compact: true });

    case "ratingOverall":
      return row.ratingOverall === null ? (
        "—"
      ) : (
        <span className="inline-flex items-center gap-0.5">
          <Star className="h-3 w-3 fill-current text-warning" />
          {formatRating(row.ratingOverall)}
        </span>
      );

    case "reviewCount":
      return formatNumber(row.reviewCount);

    case "anchors":
      if (row.anchorDistances.length) {
        return (
          <span className="text-[11px]">
            {row.anchorDistances
              .map((distance) => `${distance.label}: ${formatDistance(distance.meters)}`)
              .join(" · ")}
          </span>
        );
      }
      return "—";

    case "beds":
      return row.beds === null
        ? "—"
        : `${row.beds}${row.personCapacity ? `/${row.personCapacity}` : ""}`;

    case "cleaningFee":
      return formatMoney(row.cleaningFee, row.currency, { compact: true });

    case "cleaningRatio":
      return formatPercent(row.cleaningRatio);

    case "link":
      return row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center text-muted-foreground hover:text-foreground"
          title="Abrir no Airbnb"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null;

    default:
      return "—";
  }
}

/**
 * Mostra quais palavras-chave casaram — e, quando nenhuma casou porque o
 * conteúdo do anúncio ainda não foi carregado, diz isso em vez de deixar o
 * usuário achar que a linha passou por engano.
 */
function KeywordBadges({ row, keywords }: { row: Row; keywords: string[] }) {
  if (keywords.length === 0) return null;

  const matched = matchedKeywords(row, keywords);

  if (matched.length === 0) {
    return hasContent(row) ? null : (
      <Badge
        variant="outline"
        title="O conteúdo deste anúncio ainda não foi carregado. Calcule o preço real para trazer descrição e amenidades e verificar as palavras-chave."
      >
        não verificado
      </Badge>
    );
  }

  return (
    <>
      {matched.map((keyword) => (
        <Badge key={keyword} variant="success" title="Palavra-chave encontrada">
          {keyword}
        </Badge>
      ))}
      {matched.length < keywords.length && !hasContent(row) ? (
        <Badge variant="outline" title="As demais palavras ainda não puderam ser verificadas.">
          parcial
        </Badge>
      ) : null}
    </>
  );
}

export function roomTypeLabel(roomType: string | null): string {
  switch (roomType) {
    case "entire_home":
      return "Inteiro";
    case "private_room":
      return "Quarto privativo";
    case "shared_room":
      return "Compartilhado";
    case "hotel_room":
      return "Hotel";
    default:
      return "—";
  }
}
