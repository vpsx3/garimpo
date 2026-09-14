"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { postJson } from "@/lib/api";

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NewSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [checkIn, setCheckIn] = useState(isoDaysFromNow(30));
  const [checkOut, setCheckOut] = useState(isoDaysFromNow(35));
  const [guests, setGuests] = useState(2);
  const [maxGrossNightly, setMaxGrossNightly] = useState("");
  const [isTracked, setIsTracked] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { search } = await postJson<{ search: { id: string } }>(
        "/api/searches",
        {
          label: label || locationQuery,
          locationQuery,
          checkIn,
          checkOut,
          guests,
          maxGrossNightly: maxGrossNightly ? Number(maxGrossNightly) : null,
          currency: "BRL",
          isTracked,
        },
      );
      setOpen(false);
      router.push(`/search/${search.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Nova busca
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova busca</DialogTitle>
          <DialogDescription>
            Só o que a origem filtra bem entra aqui. Todo o resto é aplicado
            depois, sobre o cache local.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Localização">
            <Input
              required
              autoFocus
              placeholder="Lisboa, Portugal"
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
            />
          </Field>

          <Field label="Nome da busca (opcional)">
            <Input
              placeholder="Réveillon em Lisboa"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrada">
              <Input
                required
                type="date"
                value={checkIn}
                onChange={(event) => setCheckIn(event.target.value)}
              />
            </Field>
            <Field label="Saída">
              <Input
                required
                type="date"
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hóspedes">
              <Input
                required
                type="number"
                min={1}
                max={16}
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
              />
            </Field>
            <Field label="Teto de diária bruta (opcional)">
              <Input
                type="number"
                min={0}
                placeholder="sem teto"
                value={maxGrossNightly}
                onChange={(event) => setMaxGrossNightly(event.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <Checkbox
              checked={isTracked}
              onCheckedChange={(checked) => setIsTracked(checked === true)}
            />
            Re-ingerir diariamente e me avisar de quedas de preço
          </label>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Criando…" : "Criar busca"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
