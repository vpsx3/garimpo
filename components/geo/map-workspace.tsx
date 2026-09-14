"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnchorManager } from "./anchor-manager";
import { DetailDrawer } from "@/components/results/detail-drawer";
import { postJson } from "@/lib/api";
import type { AnchorRow } from "@/lib/db/queries";
import type { ResultRow, ResultsResponse } from "@/components/results/types";

// Leaflet toca `window` no import: só pode carregar no cliente.
const ResultsMap = dynamic(
  () => import("./results-map").then((mod) => mod.ResultsMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted" /> },
);

export function MapWorkspace({
  searchId,
  initialAnchors,
}: {
  searchId: string;
  initialAnchors: AnchorRow[];
}) {
  const [anchors, setAnchors] = useState(initialAnchors);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [openRow, setOpenRow] = useState<ResultRow | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await postJson<ResultsResponse>(
        `/api/searches/${searchId}/results`,
        { filter: {}, limit: 500 },
      );
      setRows(response.results);
    } catch {
      setRows([]);
    }
  }, [searchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-72 shrink-0 overflow-y-auto border-r p-3">
        <AnchorManager
          searchId={searchId}
          anchors={anchors}
          onChange={(next) => {
            setAnchors(next);
            void load();
          }}
        />
      </aside>
      <div className="flex-1">
        <ResultsMap rows={rows} anchors={anchors} onOpen={setOpenRow} />
      </div>
      <DetailDrawer
        row={openRow}
        highlightTerms={[]}
        onClose={() => setOpenRow(null)}
        onVerdictChange={() => void load()}
      />
    </div>
  );
}
