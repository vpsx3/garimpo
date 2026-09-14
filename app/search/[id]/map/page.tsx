import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MapWorkspace } from "@/components/geo/map-workspace";
import { getSearch, listAnchors } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function MapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const search = await getSearch(id);
  if (!search) notFound();

  const anchors = await listAnchors(id);

  return (
    <AppShell className="h-[calc(100vh-3rem)] overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <h1 className="text-sm font-semibold">{search.label} · mapa</h1>
        <Link
          href={`/search/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← resultados
        </Link>
      </div>
      <MapWorkspace searchId={id} initialAnchors={anchors} />
    </AppShell>
  );
}
