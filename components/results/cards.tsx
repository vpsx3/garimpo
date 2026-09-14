"use client";

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatNumber, formatRating } from "@/lib/format";
import type { ResultRow } from "./types";
import { roomTypeLabel } from "./table";

export function ResultCards({
  rows,
  onOpen,
}: {
  rows: ResultRow[];
  onOpen: (row: ResultRow) => void;
}) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card
          key={row.id}
          className="cursor-pointer overflow-hidden transition-colors hover:border-primary/40"
          onClick={() => onOpen(row)}
        >
          {row.picture_urls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.picture_urls[0]}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
          ) : null}
          <CardContent className="space-y-1.5 p-3">
            <div className="truncate text-sm font-medium">
              {row.title ?? `Anúncio ${row.external_id}`}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{roomTypeLabel(row.room_type)}</span>
              {row.rating_overall !== null ? (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-current text-warning" />
                  {formatRating(row.rating_overall)} ({formatNumber(row.review_count)})
                </span>
              ) : null}
              {row.host_is_superhost ? <Badge variant="warning">superhost</Badge> : null}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-base font-semibold">
                {formatMoney(row.effective_nightly, row.currency, { compact: true })}
              </span>
              <span className="tnum text-xs text-muted-foreground line-through">
                {formatMoney(row.gross_nightly, row.currency, { compact: true })}
              </span>
              <span className="text-[11px] text-muted-foreground">/noite real</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
