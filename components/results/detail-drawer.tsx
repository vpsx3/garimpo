"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Heart, Eye, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AMENITY_LABELS, type AmenityKey } from "@/lib/amenities/canonical";
import {
  formatDate,
  formatDistance,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRating,
} from "@/lib/format";
import { sendJson } from "@/lib/api";
import type { ResultRow } from "./types";
import { roomTypeLabel } from "./table";

export function DetailDrawer({
  row,
  onClose,
  onVerdictChange,
  highlightTerms,
}: {
  row: ResultRow | null;
  onClose: () => void;
  onVerdictChange: (listingId: string, verdict: string | null, note: string) => void;
  highlightTerms: string[];
}) {
  const [note, setNote] = useState(row?.verdict_note ?? "");
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<
    { comment: string; created_at_source: string | null }[]
  >([]);

  const listingId = row?.id;
  const termsKey = highlightTerms.join(",");

  // As avaliações são buscadas ao abrir o drawer, não junto com a tabela:
  // trazê-las para 300 linhas de uma vez seria desperdício.
  useEffect(() => {
    if (!listingId) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const url = `/api/listings/${listingId}/reviews${
      termsKey ? `?terms=${encodeURIComponent(termsKey)}` : ""
    }`;
    fetch(url)
      .then((response) => (response.ok ? response.json() : { reviews: [] }))
      .then((payload) => {
        if (!cancelled) setMatches(payload.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, termsKey]);

  if (!row) return null;

  async function setVerdict(verdict: "shortlist" | "rejected" | "seen" | null) {
    if (!row) return;
    setSaving(true);
    try {
      if (verdict === null) {
        await sendJson(`/api/listings/${row.id}/verdict`, "DELETE");
      } else {
        await sendJson(`/api/listings/${row.id}/verdict`, "PUT", { verdict, note });
      }
      onVerdictChange(row.id, verdict, note);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="right">
        <DialogHeader>
          <DialogTitle>{row.title ?? `Anúncio ${row.external_id}`}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {roomTypeLabel(row.room_type)}
            {row.person_capacity ? ` · ${row.person_capacity} hóspedes` : ""}
            {row.bedrooms !== null ? ` · ${row.bedrooms} quartos` : ""}
            {row.beds !== null ? ` · ${row.beds} camas` : ""}
            {row.bathrooms !== null ? ` · ${row.bathrooms} banheiros` : ""}
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={row.verdict === "shortlist" ? "default" : "outline"}
              disabled={saving}
              onClick={() => setVerdict(row.verdict === "shortlist" ? null : "shortlist")}
            >
              <Heart className="h-3.5 w-3.5" />
              Favoritar
            </Button>
            <Button
              size="sm"
              variant={row.verdict === "rejected" ? "destructive" : "outline"}
              disabled={saving}
              onClick={() => setVerdict(row.verdict === "rejected" ? null : "rejected")}
            >
              <X className="h-3.5 w-3.5" />
              Descartar
            </Button>
            <Button
              size="sm"
              variant={row.verdict === "seen" ? "secondary" : "outline"}
              disabled={saving}
              onClick={() => setVerdict(row.verdict === "seen" ? null : "seen")}
            >
              <Eye className="h-3.5 w-3.5" />
              Visto
            </Button>
            {row.url ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={row.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir no Airbnb
                </a>
              </Button>
            ) : null}
          </div>

          <Input
            placeholder="Anotação sobre este anúncio…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => row.verdict && setVerdict(row.verdict as "shortlist")}
          />

          {row.picture_urls?.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {row.picture_urls.slice(0, 6).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 w-full rounded object-cover"
                />
              ))}
            </div>
          ) : null}

          <Section title="Decomposição do preço">
            <dl className="space-y-1 text-xs">
              <Row label="Diária anunciada" value={formatMoney(row.gross_nightly, row.currency)} />
              <Row
                label={`Diárias (${row.nights ?? "?"} noites)`}
                value={formatMoney(
                  row.gross_nightly !== null && row.nights
                    ? row.gross_nightly * row.nights
                    : null,
                  row.currency,
                )}
              />
              <Row label="Taxa de limpeza" value={formatMoney(row.cleaning_fee, row.currency)} />
              <Row label="Taxa de serviço" value={formatMoney(row.service_fee, row.currency)} />
              <Row label="Impostos" value={formatMoney(row.taxes, row.currency)} />
              <Row label="Descontos" value={formatMoney(row.discount_total, row.currency)} />
              <Separator className="my-1.5" />
              <Row label="Total da estadia" value={formatMoney(row.total_price, row.currency)} strong />
              <Row
                label="Diária efetiva"
                value={formatMoney(row.effective_nightly, row.currency)}
                strong
              />
              <Row label="Por pessoa" value={formatMoney(row.price_per_person, row.currency)} />
              <Row
                label="% do total em limpeza"
                value={formatPercent(row.cleaning_ratio, 1)}
              />
              <Row
                label="Delta vs. anunciada"
                value={row.price_honesty ? `${row.price_honesty.toFixed(2)}×` : "—"}
              />
            </dl>
            {row.price_source === "search" ? (
              <p className="mt-2 text-[11px] text-warning">
                Preço estimado a partir da busca — a cotação real, com taxas, ainda
                não foi buscada para este anúncio.
              </p>
            ) : null}
          </Section>

          <Section title="Avaliações">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row label="Geral" value={formatRating(row.rating_overall)} />
              <Row label="Total" value={formatNumber(row.review_count)} />
              <Row label="Limpeza" value={formatRating(row.rating_cleanliness)} />
              <Row label="Localização" value={formatRating(row.rating_location)} />
              <Row label="Veracidade" value={formatRating(row.rating_accuracy)} />
              <Row label="Check-in" value={formatRating(row.rating_checkin)} />
              <Row label="Comunicação" value={formatRating(row.rating_communication)} />
              <Row label="Custo-benefício" value={formatRating(row.rating_value)} />
              <Row label="Por mês" value={formatNumber(row.reviews_per_month, 1)} />
              <Row label="Última" value={formatDate(row.last_review_at)} />
            </dl>
          </Section>

          {matches.length ? (
            <Section
              title={
                termsKey
                  ? "Trechos que casaram com o filtro"
                  : "Avaliações recentes"
              }
            >
              <ul className="space-y-2">
                {matches.map((match, index) => (
                  <li key={index} className="rounded border bg-muted/40 p-2 text-xs">
                    <Highlighted text={match.comment} terms={highlightTerms} />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(match.created_at_source)}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Anfitrião">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row label="Nome" value={row.host_name ?? "—"} />
              <Row label="Superhost" value={row.host_is_superhost ? "sim" : "não"} />
              <Row label="Desde" value={formatDate(row.host_since)} />
              <Row label="Anúncios" value={formatNumber(row.host_listing_count)} />
              <Row
                label="Taxa de resposta"
                value={row.host_response_rate ? `${row.host_response_rate}%` : "—"}
              />
              <Row label="Tempo de resposta" value={row.host_response_time ?? "—"} />
            </dl>
          </Section>

          {row.amenities?.length ? (
            <Section title="Amenidades">
              <div className="flex flex-wrap gap-1">
                {row.amenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary">
                    {AMENITY_LABELS[amenity as AmenityKey] ?? amenity}
                  </Badge>
                ))}
              </div>
            </Section>
          ) : null}

          {row.anchor_distances?.length ? (
            <Section title="Distância às âncoras">
              <dl className="space-y-1 text-xs">
                {row.anchor_distances.map((distance) => (
                  <Row
                    key={distance.anchorId}
                    label={distance.label}
                    value={formatDistance(distance.meters)}
                  />
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Distâncias aproximadas: a origem desloca o pino do anúncio em até
                ~150 m enquanto ele não é reservado.
              </p>
            </Section>
          ) : null}

          {row.description ? (
            <Section title="Descrição">
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {row.description.slice(0, 1500)}
              </p>
            </Section>
          ) : null}

          {row.house_rules ? (
            <Section title="Regras da casa">
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {row.house_rules.slice(0, 1000)}
              </p>
            </Section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "tnum font-semibold" : "tnum"}>{value}</dd>
    </div>
  );
}

/** Destaca os termos do filtro textual dentro do trecho da avaliação. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;

  const escaped = terms
    .filter((term) => term.trim().length >= 2)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        pattern.test(part) && index % 2 === 1 ? (
          <mark key={index} className="rounded bg-warning/30 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
