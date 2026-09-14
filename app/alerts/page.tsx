import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { AlertFeed } from "@/components/alerts/feed";
import { Card, CardContent } from "@/components/ui/card";
import { getSql } from "@/lib/db/client";
import type { AlertRow } from "@/components/alerts/feed";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  let alerts: AlertRow[] = [];
  let error: string | null = null;

  try {
    const sql = await getSql();
    alerts = await sql<AlertRow[]>`
      select
        a.id, a.kind, a.payload, a.created_at, a.read_at,
        a.search_id, a.listing_id,
        s.label as search_label, coalesce(s.currency, 'BRL') as currency,
        l.title, l.url
      from alerts a
      left join searches s on s.id = a.search_id
      left join listings l on l.id = a.listing_id
      order by (a.read_at is not null), a.created_at desc
      limit 200
    `;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <AppShell className="mx-auto w-full max-w-3xl gap-4 px-4 py-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Quedas de preço, novos anúncios que batem um filtro salvo e anúncios
            que saíram do ar.
          </p>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-1 p-4">
            <p className="text-sm font-medium text-destructive">
              Não foi possível ler os alertas.
            </p>
            <p className="font-mono text-xs text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum alerta ainda. Marque uma busca como rastreada em{" "}
            <Link href="/" className="underline">
              Buscas
            </Link>{" "}
            para que o cron diário passe a acompanhá-la.
          </CardContent>
        </Card>
      ) : (
        <AlertFeed initialAlerts={alerts} />
      )}
    </AppShell>
  );
}
