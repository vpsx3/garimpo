"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SearchQueryInput } from "@/lib/search/query";

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function SearchForm({
  onSearch,
  pending,
}: {
  onSearch: (query: SearchQueryInput) => void;
  pending: boolean;
}) {
  const [locationQuery, setLocationQuery] = useState("");
  const [checkIn, setCheckIn] = useState(isoDaysFromNow(30));
  const [checkOut, setCheckOut] = useState(isoDaysFromNow(35));
  const [guests, setGuests] = useState(2);
  const [maxGrossNightly, setMaxGrossNightly] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSearch({
      locationQuery,
      checkIn,
      checkOut,
      guests,
      maxGrossNightly: maxGrossNightly ? Number(maxGrossNightly) : null,
      currency: "BRL",
      limit: 200,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-b px-4 py-2.5">
      <Field label="Localização" className="min-w-52 flex-1">
        <Input
          required
          placeholder="Lisboa, Portugal"
          value={locationQuery}
          onChange={(event) => setLocationQuery(event.target.value)}
        />
      </Field>
      <Field label="Entrada" className="w-36">
        <Input
          required
          type="date"
          value={checkIn}
          onChange={(event) => setCheckIn(event.target.value)}
        />
      </Field>
      <Field label="Saída" className="w-36">
        <Input
          required
          type="date"
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
        />
      </Field>
      <Field label="Hóspedes" className="w-24">
        <Input
          required
          type="number"
          min={1}
          max={16}
          value={guests}
          onChange={(event) => setGuests(Number(event.target.value))}
        />
      </Field>
      <Field label="Teto diária" className="w-28">
        <Input
          type="number"
          min={0}
          placeholder="sem teto"
          value={maxGrossNightly}
          onChange={(event) => setMaxGrossNightly(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending || locationQuery.length < 2}>
        <Search className="h-3.5 w-3.5" />
        {pending ? "Buscando…" : "Buscar"}
      </Button>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
