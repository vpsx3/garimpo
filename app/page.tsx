import { Workspace } from "@/components/search/workspace";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <span className="text-sm font-semibold tracking-tight">Garimpo</span>
        <span className="text-[11px] text-muted-foreground">
          busca de acomodações com filtros que o Airbnb não tem
        </span>
      </header>
      <Workspace />
    </div>
  );
}
