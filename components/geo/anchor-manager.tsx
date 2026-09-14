"use client";

import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistance } from "@/lib/format";
import type { Anchor } from "@/components/results/types";

export function AnchorManager({
  anchors,
  onChange,
  compact = false,
}: {
  anchors: Anchor[];
  onChange: (anchors: Anchor[]) => void;
  compact?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [maxDistanceM, setMaxDistanceM] = useState("1200");
  const [weight, setWeight] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(
          payload?.error === "not_found"
            ? `Nada encontrado para "${address}".`
            : (payload?.detail ?? "Falha ao geocodificar."),
        );
        return;
      }
      onChange([
        ...anchors,
        {
          id: crypto.randomUUID(),
          label: label || address,
          lat: payload.lat,
          lng: payload.lng,
          maxDistanceM: maxDistanceM ? Number(maxDistanceM) : null,
          weight: Number(weight) || 0,
        },
      ]);
      setLabel("");
      setAddress("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {anchors.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhum ponto de referência. Adicione um endereço para filtrar e
          ordenar por distância.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {anchors.map((anchor) => (
            <li
              key={anchor.id}
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{anchor.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {anchor.lat.toFixed(4)}, {anchor.lng.toFixed(4)}
                </div>
              </div>
              <span className="tnum shrink-0 text-[11px] text-muted-foreground">
                {anchor.maxDistanceM
                  ? `≤ ${formatDistance(anchor.maxDistanceM).replace("~", "")}`
                  : "sem raio"}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onChange(anchors.filter((item) => item.id !== anchor.id))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-2 border-t pt-2.5">
        <div className="space-y-1">
          <Label>Endereço ou lugar</Label>
          <Input
            required
            placeholder="Rua Augusta 100, Lisboa"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
        {compact ? null : (
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              placeholder="Escritório"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Raio máx. (m)</Label>
            <Input
              type="number"
              min={100}
              step={100}
              value={maxDistanceM}
              onChange={(event) => setMaxDistanceM(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Peso no score</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <Button type="submit" size="sm" disabled={pending || !address}>
          {pending ? "Geocodificando…" : "Adicionar âncora"}
        </Button>
      </form>

      <p className="rounded border border-warning/40 bg-warning/10 p-2 text-[11px] leading-relaxed">
        <strong>Distâncias são aproximadas.</strong> O Airbnb desloca o pino de
        anúncios não reservados em até ~150 m. O filtro soma uma margem de
        tolerância (padrão 200 m) justamente por isso.
      </p>
    </div>
  );
}
