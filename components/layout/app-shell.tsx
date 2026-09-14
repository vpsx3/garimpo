import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Garimpo
        </Link>
        <nav className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Buscas
          </Link>
          <Link href="/alerts" className="hover:text-foreground">
            Alertas
          </Link>
        </nav>
      </header>
      <main className={cn("flex flex-1 flex-col", className)}>{children}</main>
    </div>
  );
}
