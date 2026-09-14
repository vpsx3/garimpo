"use client";

import { ExternalLink, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatNumber, formatRating } from "@/lib/format";
import type { Row } from "./types";
import { roomTypeLabel } from "./table";

export function ResultCards({
  rows,
  onOpen,
}: {
  rows: Row[];
  onOpen: (row: Row) => void;
}) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card
          key={row.externalId}
          className="cursor-pointer overflow-hidden transition-colors hover:border-primary/40"
          onClick={() => onOpen(row)}
        >
          {row.pictureUrls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.pictureUrls[0]}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
          ) : null}
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.title ?? `Anúncio ${row.externalId}`}
              </div>
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{roomTypeLabel(row.roomType)}</span>
              {row.ratingOverall !== null ? (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-current text-warning" />
                  {formatRating(row.ratingOverall)} ({formatNumber(row.reviewCount)})
                </span>
              ) : null}
              {row.isSuperhost ? <Badge variant="warning">superhost</Badge> : null}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-base font-semibold">
                {formatMoney(row.effectiveNightly, row.currency, { compact: true })}
              </span>
              <span className="tnum text-xs text-muted-foreground line-through">
                {formatMoney(row.grossNightly, row.currency, { compact: true })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {row.priceSource === "quote" ? "/noite real" : "/noite estimada"}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
