import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { NewSearchDialog } from "@/components/searches/new-search-dialog";
import { IngestButton } from "@/components/searches/ingest-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listSearches, type SearchListItem } from "@/lib/db/queries";
import { formatMoney, formatNumber, nightsBetween, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let searches: SearchListItem[] = [];
  let error: string | null = null;

  try {
    searches = await listSearches();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <AppShell className="mx-auto w-full max-w-5xl gap-6 px-4 py-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Buscas</h1>
          <p className="text-sm text-muted-foreground">
            Cada busca é um recorte de localização, datas e hóspedes. Os filtros
            vêm depois, sobre o cache local.
          </p>
        </div>
        <NewSearchDialog />
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-1 p-4">
            <p className="text-sm font-medium text-destructive">
              Não foi possível ler o banco.
            </p>
            <p className="font-mono text-xs text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {!error && searches.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma busca ainda. Crie a primeira para começar a ingerir anúncios.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <ul className="grid gap-3">
        {searches.map((search) => {
          const nights = nightsBetween(search.check_in, search.check_out);
          return (
            <li key={search.id}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                  <div className="min-w-56 flex-1">
                    <Link
                      href={`/search/${search.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {search.label}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {search.location_query} · {search.check_in} → {search.check_out}{" "}
                      ({nights} {nights === 1 ? "noite" : "noites"}) ·{" "}
                      {search.guests} {search.guests === 1 ? "hóspede" : "hóspedes"}
                    </p>
                  </div>

                  <Stat
                    label="Anúncios"
                    value={formatNumber(search.listing_count)}
                  />
                  <Stat
                    label="Menor diária efetiva"
                    value={formatMoney(search.min_effective_nightly, search.currency)}
                  />
                  <Stat
                    label="Última ingestão"
                    value={relativeTime(search.last_ingested_at)}
                  />

                  <div className="flex items-center gap-2">
                    {search.is_tracked ? (
                      <Badge variant="success">rastreada</Badge>
                    ) : null}
                    <IngestButton searchId={search.id} />
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-sm font-medium">{value}</div>
    </div>
  );
}
