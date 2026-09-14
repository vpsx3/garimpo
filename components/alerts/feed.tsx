"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, BellOff, CircleSlash, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sendJson } from "@/lib/api";
import { formatMoney, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AlertRow = {
  id: string;
  kind: "price_drop" | "new_match" | "became_unavailable";
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  search_id: string | null;
  listing_id: string | null;
  search_label: string | null;
  currency: string;
  title: string | null;
  url: string | null;
};

export function AlertFeed({ initialAlerts }: { initialAlerts: AlertRow[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const unread = alerts.filter((alert) => !alert.read_at);

  async function markRead(ids?: string[]) {
    await sendJson("/api/alerts", "PATCH", ids ? { ids } : {});
    const now = new Date().toISOString();
    setAlerts((current) =>
      current.map((alert) =>
        !ids || ids.includes(alert.id)
          ? { ...alert, read_at: alert.read_at ?? now }
          : alert,
      ),
    );
  }

  return (
    <div className="space-y-3">
      {unread.length > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {unread.length} não {unread.length === 1 ? "lido" : "lidos"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => markRead()}>
            <BellOff className="h-3.5 w-3.5" />
            Marcar todos como lidos
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <Card className={cn(alert.read_at && "opacity-55")}>
              <CardContent className="flex items-start gap-3 p-3">
                <AlertIcon kind={alert.kind} />

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {describe(alert)}
                    </span>
                    {alert.read_at ? null : <Badge>novo</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {alert.url ? (
                      <a
                        href={alert.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:underline"
                      >
                        {alert.title ?? "Anúncio"}
                      </a>
                    ) : (
                      (alert.title ?? "Anúncio")
                    )}
                    {alert.search_id ? (
                      <>
                        {" · "}
                        <Link
                          href={`/search/${alert.search_id}`}
                          className="hover:underline"
                        >
                          {alert.search_label}
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-muted-foreground">
                    {relativeTime(alert.created_at)}
                  </div>
                  {alert.read_at ? null : (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => markRead([alert.id])}
                    >
                      marcar lido
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertIcon({ kind }: { kind: AlertRow["kind"] }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (kind === "price_drop")
    return <ArrowDownRight className={cn(className, "text-success")} />;
  if (kind === "new_match")
    return <Sparkles className={cn(className, "text-primary")} />;
  return <CircleSlash className={cn(className, "text-muted-foreground")} />;
}

function describe(alert: AlertRow): string {
  const payload = alert.payload ?? {};
  switch (alert.kind) {
    case "price_drop": {
      const from = Number(payload.from);
      const to = Number(payload.to);
      return `Caiu ${payload.dropPct ?? "?"}% — ${formatMoney(
        from,
        alert.currency,
        { compact: true },
      )} → ${formatMoney(to, alert.currency, { compact: true })} por noite`;
    }
    case "new_match":
      return `Novo anúncio bate "${payload.filterSetLabel ?? "filtro salvo"}"`;
    case "became_unavailable":
      return "Ficou indisponível";
    default:
      return alert.kind;
  }
}
