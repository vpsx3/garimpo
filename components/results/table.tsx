"use client";

import { ArrowDown, ArrowUp, Star } from "lucide-react";
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
import type { OrderKey } from "@/lib/filters/build";
import type { ResultRow } from "./types";
import { PriceSparkline } from "./sparkline";

type Column = {
  key: OrderKey | "score" | "anchors";
  label: string;
  hint?: string;
  align?: "left" | "right";
  sortable?: boolean;
};

const COLUMNS: Column[] = [
  { key: "score", label: "Score", align: "right", sortable: true },
  {
    key: "effective_nightly",
    label: "Diária efetiva",
    hint: "Total da estadia dividido pelas noites — inclui limpeza, serviço e impostos.",
    align: "right",
    sortable: true,
  },
  { key: "total_price", label: "Total", align: "right", sortable: true },
  { key: "rating_overall", label: "Nota", align: "right", sortable: true },
  { key: "review_count", label: "Aval.", align: "right", sortable: true },
  { key: "anchors", label: "Distância", align: "right" },
  { key: "beds", label: "Camas", align: "right", sortable: true },
  { key: "cleaning_fee", label: "Limpeza", align: "right", sortable: true },
  {
    key: "cleaning_ratio",
    label: "% limp.",
    hint: "Quanto do total é taxa de limpeza.",
    align: "right",
    sortable: true,
  },
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
}: {
  rows: ResultRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (row: ResultRow) => void;
  orderBy: string;
  orderDir: "asc" | "desc";
  onSort: (key: string) => void;
  hasScore: boolean;
}) {
  const columns = hasScore ? COLUMNS : COLUMNS.filter((c) => c.key !== "score");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead className="sticky top-12 z-10 bg-background">
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
                onClick={column.sortable ? () => onSort(column.key) : undefined}
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
              key={row.id}
              className={cn(
                "border-b transition-colors hover:bg-accent/40",
                row.verdict === "rejected" && "opacity-45",
                row.verdict === "shortlist" && "bg-success/5",
              )}
            >
              <td className="px-2 py-1.5 align-middle">
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={() => onToggleSelect(row.id)}
                  aria-label="Selecionar para comparação"
                />
              </td>

              <td className="max-w-80 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="block w-full truncate text-left font-medium hover:underline"
                >
                  {row.title ?? `Anúncio ${row.external_id}`}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span>{roomTypeLabel(row.room_type)}</span>
                  {row.host_is_superhost ? (
                    <Badge variant="warning">superhost</Badge>
                  ) : null}
                  {row.price_source === "search" ? (
                    <Badge
                      variant="outline"
                      title="Preço estimado da busca; a cotação real ainda não foi buscada."
                    >
                      estimado
                    </Badge>
                  ) : null}
                  {!row.is_available ? (
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

function renderCell(key: Column["key"], row: ResultRow) {
  switch (key) {
    case "score":
      return row.score === undefined ? (
        "—"
      ) : (
        <span className="font-medium">{(row.score * 100).toFixed(0)}</span>
      );

    case "effective_nightly":
      // O contraste entre diária efetiva e diária anunciada é o argumento de
      // venda do produto: os dois aparecem sempre lado a lado.
      return (
        <div className="flex items-center justify-end gap-1.5">
          {row.price_history && row.price_history.length >= 2 ? (
            <PriceSparkline points={row.price_history} />
          ) : null}
          <span className="font-medium">
            {formatMoney(row.effective_nightly, row.currency, { compact: true })}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatMoney(row.gross_nightly, row.currency, { compact: true })}
          </span>
        </div>
      );

    case "total_price":
      return formatMoney(row.total_price, row.currency, { compact: true });

    case "rating_overall":
      return row.rating_overall === null ? (
        "—"
      ) : (
        <span className="inline-flex items-center gap-0.5">
          <Star className="h-3 w-3 fill-current text-warning" />
          {formatRating(row.rating_overall)}
        </span>
      );

    case "review_count":
      return formatNumber(row.review_count);

    case "anchors":
      if (row.anchor_distances?.length) {
        return (
          <span className="text-[11px]">
            {row.anchor_distances
              .map((d) => `${d.label}: ${formatDistance(d.meters)}`)
              .join(" · ")}
          </span>
        );
      }
      return formatDistance(row.min_anchor_distance_m);

    case "beds":
      return row.beds === null
        ? "—"
        : `${row.beds}${row.person_capacity ? `/${row.person_capacity}` : ""}`;

    case "cleaning_fee":
      return formatMoney(row.cleaning_fee, row.currency, { compact: true });

    case "cleaning_ratio":
      return formatPercent(row.cleaning_ratio);

    default:
      return "—";
  }
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
