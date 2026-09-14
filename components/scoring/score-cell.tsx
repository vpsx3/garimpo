"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScoreComponent } from "@/lib/scoring/engine";

/**
 * O score sem a decomposição é inútil: um número opaco substituindo outro
 * número opaco. O hover mostra quanto cada critério contribuiu.
 */
export function ScoreCell({
  score,
  breakdown,
}: {
  score: number;
  breakdown: ScoreComponent[] | undefined;
}) {
  const value = (score * 100).toFixed(0);

  if (!breakdown?.length) return <span className="font-medium">{value}</span>;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help font-medium underline decoration-dotted underline-offset-2">
            {value}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="w-64">
          <div className="space-y-1">
            <div className="flex justify-between border-b pb-1 text-[11px] font-semibold">
              <span>Critério</span>
              <span>Contribuição</span>
            </div>
            {breakdown.map((part) => (
              <div key={part.key} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{part.label}</span>
                  <span className="tnum font-medium">
                    {(part.contribution * 100).toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round(part.normalized * 100)}%` }}
                    />
                  </div>
                  <span className="tnum w-14 shrink-0 text-right text-[10px] text-muted-foreground">
                    peso {part.weight}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
