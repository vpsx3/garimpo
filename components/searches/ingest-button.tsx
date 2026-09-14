"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api";
import type { IngestResult } from "@/lib/ingest/run";

export function IngestButton({
  searchId,
  variant = "outline",
}: {
  searchId: string;
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [, startTransition] = useTransition();

  async function ingest() {
    setPending(true);
    setError(null);
    try {
      const response = await postJson<IngestResult>(
        `/api/searches/${searchId}/ingest`,
        {},
      );
      setResult(response);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={variant} onClick={ingest} disabled={pending}>
        <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {pending ? "Ingerindo…" : "Re-ingerir"}
      </Button>
      {result ? (
        <span className="text-[11px] text-muted-foreground">
          {result.upserted} anúncios · {result.snapshots} preços
          {result.fellBackTo ? " · caiu para a Apify" : ""}
        </span>
      ) : null}
      {error ? (
        <span className="max-w-64 text-right text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
