import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { IngestButton } from "@/components/searches/ingest-button";
import { ResultsWorkspace } from "@/components/results/workspace";
import { Badge } from "@/components/ui/badge";
import { getSearch, listAnchors, listFilterSets } from "@/lib/db/queries";
import { nightsBetween, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const search = await getSearch(id);
  if (!search) notFound();

  const [filterSets, anchors] = await Promise.all([
    listFilterSets(),
    listAnchors(id),
  ]);

  const nights = nightsBetween(search.check_in, search.check_out);

  return (
    <AppShell className="h-[calc(100vh-3rem)] overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
        <div>
          <h1 className="text-sm font-semibold">{search.label}</h1>
          <p className="text-[11px] text-muted-foreground">
            {search.location_query} · {search.check_in} → {search.check_out} (
            {nights} {nights === 1 ? "noite" : "noites"}) · {search.guests}{" "}
            {search.guests === 1 ? "hóspede" : "hóspedes"} · ingerido{" "}
            {relativeTime(search.last_ingested_at)}
          </p>
        </div>

        {search.is_tracked ? <Badge variant="success">rastreada</Badge> : null}

        <div className="flex-1" />

        <nav className="flex items-center gap-3 text-xs">
          <Link href={`/search/${id}/map`} className="text-muted-foreground hover:text-foreground">
            Mapa
          </Link>
          <Link href={`/search/${id}/compare`} className="text-muted-foreground hover:text-foreground">
            Comparar
          </Link>
        </nav>

        <IngestButton searchId={id} />
      </div>

      <ResultsWorkspace
        search={search}
        filterSets={filterSets}
        hasAnchors={anchors.length > 0}
      />
    </AppShell>
  );
}
