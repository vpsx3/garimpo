"use client";

import { Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SCORING_PRESETS } from "@/lib/scoring/engine";
import {
  CRITERION_LABELS,
  LOWER_IS_BETTER,
  SCORING_CRITERIA,
  type ScoringWeights,
} from "@/lib/scoring/types";

export function WeightsEditor({
  weights,
  onChange,
}: {
  weights: ScoringWeights;
  onChange: (weights: ScoringWeights) => void;
}) {
  const active = Object.values(weights).filter((weight) => (weight ?? 0) > 0).length;

  return (
    <div className="space-y-3 border-b py-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sliders className="h-3.5 w-3.5" />
          Pontuação
        </h3>
        {active > 0 ? (
          <Button size="xs" variant="ghost" onClick={() => onChange({})}>
            Desligar
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1">
        {Object.entries(SCORING_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            size="xs"
            variant="outline"
            onClick={() => onChange(preset.weights)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {active > 0 ? (
        <div className="space-y-2 pt-1">
          {SCORING_CRITERIA.map((criterion) => {
            const weight = weights[criterion] ?? 0;
            return (
              <div key={criterion} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <Label
                    title={
                      LOWER_IS_BETTER.includes(criterion)
                        ? "Menor é melhor"
                        : "Maior é melhor"
                    }
                  >
                    {CRITERION_LABELS[criterion]}
                    {LOWER_IS_BETTER.includes(criterion) ? " ↓" : ""}
                  </Label>
                  <span className="tnum text-[11px] text-muted-foreground">
                    {weight}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={[weight]}
                  onValueChange={([value]) => {
                    const next = { ...weights };
                    if (value === 0) delete next[criterion];
                    else next[criterion] = value;
                    onChange(next);
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Escolha um preset ou ajuste os pesos para ranquear por score em vez de
          por preço.
        </p>
      )}
    </div>
  );
}
