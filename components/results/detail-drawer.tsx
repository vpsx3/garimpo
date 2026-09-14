"use client";

import { ExternalLink, Eye, Heart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import type { Row, Verdict } from "./types";
import { roomTypeLabel } from "./table";
export function DetailDrawer({
  row,
  onClose,
  onVerdictChange,
  highlightTerms,
}: {
  row: Row | null;
  onClose: () => void;
  onVerdictChange: (externalId: string, verdict: Verdict) => void;
  highlightTerms: string[];
}) {
  if (!row) return null;
  const toggle = (verdict: Exclude<Verdict, null>) =>
    onVerdictChange(row.externalId, row.verdict === verdict ? null : verdict);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="right">
        <DialogHeader>
          <DialogTitle>{row.title ?? `Anúncio ${row.externalId}`}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {roomTypeLabel(row.roomType)}
            {row.personCapacity ? ` · ${row.personCapacity} hóspedes` : ""}
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
              onClick={() => toggle("shortlist")}
            >
              <Heart className="h-3.5 w-3.5" />
              Favoritar
            </Button>
            <Button
              size="sm"
              variant={row.verdict === "rejected" ? "destructive" : "outline"}
              onClick={() => toggle("rejected")}
            >
              <X className="h-3.5 w-3.5" />
              Descartar
            </Button>
            <Button
              size="sm"
              variant={row.verdict === "seen" ? "secondary" : "outline"}
              onClick={() => toggle("seen")}
            >
              <Eye className="h-3.5 w-3.5" />
              Visto
            </Button>
            {row.url ? (
              <Button size="sm" asChild>
                <a href={row.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir no Airbnb
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            A triagem vale só para esta sessão — nada é salvo. Recarregar a
            página zera favoritos e descartes.
          </p>
          {row.pictureUrls?.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {row.pictureUrls.slice(0, 6).map((url) => (
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
              <DetailRow label="Diária anunciada" value={formatMoney(row.grossNightly, row.currency)} />
              <DetailRow
                label={`Diárias (${row.nights} ${row.nights === 1 ? "noite" : "noites"})`}
                value={formatMoney(
                  row.grossNightly !== null ? row.grossNightly * row.nights : null,
                  row.currency,
                )}
              />
              <DetailRow label="Taxa de limpeza" value={formatMoney(row.cleaningFee, row.currency)} />
              <DetailRow label="Taxa de serviço" value={formatMoney(row.serviceFee, row.currency)} />
              <DetailRow label="Impostos" value={formatMoney(row.taxes, row.currency)} />
              <DetailRow label="Descontos" value={formatMoney(row.discountTotal, row.currency)} />
              <Separator className="my-1.5" />
              <DetailRow label="Total da estadia" value={formatMoney(row.totalPrice, row.currency)} strong />
              <DetailRow label="Diária efetiva" value={formatMoney(row.effectiveNightly, row.currency)} strong />
              <DetailRow label="Por pessoa" value={formatMoney(row.pricePerPerson, row.currency)} />
              <DetailRow label="% do total em limpeza" value={formatPercent(row.cleaningRatio, 1)} />
              <DetailRow
                label="Delta vs. anunciada"
                value={row.priceHonesty ? `${row.priceHonesty.toFixed(2)}×` : "—"}
              />
            </dl>
            {row.priceSource === "search" ? (
              <p className="mt-2 text-[11px] text-warning">
                Preço estimado a partir da busca. Use &ldquo;Calcular preço
                real&rdquo; para trazer limpeza, serviço e impostos.
              </p>
            ) : null}
          </Section>
          <Section title="Avaliações">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <DetailRow label="Geral" value={formatRating(row.ratingOverall)} />
              <DetailRow label="Total" value={formatNumber(row.reviewCount)} />
              <DetailRow label="Limpeza" value={formatRating(row.ratingCleanliness)} />
              <DetailRow label="Localização" value={formatRating(row.ratingLocation)} />
              <DetailRow label="Veracidade" value={formatRating(row.ratingAccuracy)} />
              <DetailRow label="Check-in" value={formatRating(row.ratingCheckin)} />
              <DetailRow label="Comunicação" value={formatRating(row.ratingCommunication)} />
              <DetailRow label="Custo-benefício" value={formatRating(row.ratingValue)} />
              <DetailRow label="Última" value={formatDate(row.lastReviewAt)} />
            </dl>
          </Section>
          {row.reviews.length ? (
            <Section
              title={
                highlightTerms.length
                  ? "Avaliações e trechos que casaram com o filtro"
                  : "Avaliações"
              }
            >
              <ul className="space-y-2">
                {row.reviews.slice(0, 12).map((review, index) => (
                  <li key={index} className="rounded border bg-muted/40 p-2 text-xs">
                    <Highlighted text={review.comment} terms={highlightTerms} />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(review.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Anfitrião">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <DetailRow label="Nome" value={row.hostName ?? "—"} />
              <DetailRow label="Superhost" value={row.isSuperhost ? "sim" : "não"} />
              <DetailRow label="Desde" value={formatDate(row.hostSince)} />
              <DetailRow label="Anúncios" value={formatNumber(row.hostListingCount)} />
              <DetailRow
                label="Taxa de resposta"
                value={row.hostResponseRate ? `${row.hostResponseRate}%` : "—"}
              />
            </dl>
          </Section>
          {row.amenities.length ? (
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
          {row.anchorDistances.length ? (
            <Section title="Distância às âncoras">
              <dl className="space-y-1 text-xs">
                {row.anchorDistances.map((distance) => (
                  <DetailRow
                    key={distance.anchorId}
                    label={distance.label}
                    value={formatDistance(distance.meters)}
                  />
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Distâncias aproximadas: o Airbnb desloca o pino do anúncio em
                até ~150 m enquanto ele não é reservado.
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
          {row.houseRules ? (
            <Section title="Regras da casa">
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {row.houseRules.slice(0, 1000)}
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
function DetailRow({
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
  const escaped = terms
    .filter((term) => term.trim().length >= 2)
    .map((term) => term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
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
