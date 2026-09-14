import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { detectAlerts } from "@/lib/alerts/detect";
import { sendAlertDigest } from "@/lib/alerts/notify";
import { ingestSearch } from "@/lib/ingest/run";
import { enrichSearch } from "@/lib/ingest/enrich";
import { ProviderStaleError } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Re-ingestão diária das buscas rastreadas.
 *
 * As buscas são processadas **em sequência**, nunca em paralelo (§13):
 * bloqueio de IP é o cenário de falha realista, e rodar várias ingestões ao
 * mesmo tempo é o jeito mais rápido de chegar lá.
 *
 * A autenticação é feita pelo middleware, via Authorization: Bearer.
 */
export async function GET() {
  const sql = await getSql();

  const searches = await sql<{ id: string; label: string }[]>`
    select id, label from searches where is_tracked order by created_at
  `;

  const startedAt = Date.now();
  const results: unknown[] = [];

  for (const search of searches) {
    const since = new Date();
    try {
      const ingest = await ingestSearch(search.id);

      // Enriquecimento enxuto no cron: as 20 melhores opções de preço. O
      // resto fica para quando o Vini abrir a tela e pedir.
      const enrich = await enrichSearch(search.id, {
        limit: 20,
        steps: { quote: true, detail: false, reviews: false },
      });

      const alerts = await detectAlerts(search.id, { since });

      results.push({ searchId: search.id, label: search.label, ingest, enrich, alerts });
    } catch (error) {
      results.push({
        searchId: search.id,
        label: search.label,
        error: error instanceof Error ? error.message : String(error),
        stale: error instanceof ProviderStaleError,
      });
    }
  }

  let notified = false;
  try {
    notified = await sendAlertDigest(sql);
  } catch (error) {
    results.push({
      notifyError: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({
    searches: searches.length,
    notified,
    durationMs: Date.now() - startedAt,
    results,
  });
}
