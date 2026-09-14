"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CANCELLATION_POLICIES,
  REVIEW_EXCLUDE_PRESET,
  REVIEW_INCLUDE_PRESET,
  ROOM_TYPES,
  type FilterDefinition,
} from "@/lib/filters/types";
import { AmenityBuilder } from "./amenity-builder";

type Update = <K extends keyof FilterDefinition>(
  key: K,
  value: FilterDefinition[K],
) => void;

export function FilterPanel({
  filter,
  onChange,
  count,
  total,
  hasAnchors,
  anchorsSlot,
}: {
  filter: FilterDefinition;
  onChange: (next: FilterDefinition) => void;
  count: number | null;
  total: number;
  hasAnchors: boolean;
  anchorsSlot?: React.ReactNode;
}) {
  const update: Update = (key, value) => {
    const next = { ...filter };
    if (value === null || value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  };

  const activeCount = Object.keys(filter).length;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="text-xs">
          <span className="tnum font-semibold">{count ?? "—"}</span>
          <span className="text-muted-foreground"> de {total} anúncios</span>
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 ? (
            <Badge variant="secondary">{activeCount} filtros</Badge>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onChange({})}
            disabled={activeCount === 0}
          >
            Limpar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8">
        <Accordion
          type="multiple"
          defaultValue={["preco", "avaliacoes"]}
          className="w-full"
        >
          <Section value="preco" title="Preço">
            <Pair>
              <NumberField
                label="Diária efetiva mín."
                value={filter.effectiveNightlyMin}
                onChange={(v) => update("effectiveNightlyMin", v)}
              />
              <NumberField
                label="Diária efetiva máx."
                value={filter.effectiveNightlyMax}
                onChange={(v) => update("effectiveNightlyMax", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Total mín."
                value={filter.totalPriceMin}
                onChange={(v) => update("totalPriceMin", v)}
              />
              <NumberField
                label="Total máx."
                value={filter.totalPriceMax}
                onChange={(v) => update("totalPriceMax", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Por pessoa máx."
                value={filter.pricePerPersonMax}
                onChange={(v) => update("pricePerPersonMax", v)}
              />
              <NumberField
                label="Taxa de limpeza máx."
                value={filter.cleaningFeeMax}
                onChange={(v) => update("cleaningFeeMax", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="% limpeza máx."
                hint="Fração do total, 0 a 1. Expõe quem esconde preço na limpeza."
                step={0.05}
                value={filter.cleaningRatioMax}
                onChange={(v) => update("cleaningRatioMax", v)}
              />
              <NumberField
                label="Delta vs. anunciada"
                hint="Diária efetiva ÷ diária anunciada. 1,0 é honesto."
                step={0.05}
                value={filter.priceHonestyMax}
                onChange={(v) => update("priceHonestyMax", v)}
              />
            </Pair>
            <CheckField
              label="Só com desconto aplicado"
              checked={filter.onlyWithDiscount}
              onChange={(v) => update("onlyWithDiscount", v)}
            />
            <CheckField
              label="Só disponíveis"
              checked={filter.onlyAvailable}
              onChange={(v) => update("onlyAvailable", v)}
            />
          </Section>

          <Section value="avaliacoes" title="Avaliações">
            <Pair>
              <NumberField
                label="Nota geral mín."
                step={0.1}
                value={filter.ratingOverallMin}
                onChange={(v) => update("ratingOverallMin", v)}
              />
              <NumberField
                label="Nº de avaliações mín."
                value={filter.reviewCountMin}
                onChange={(v) => update("reviewCountMin", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Limpeza mín."
                step={0.1}
                value={filter.ratingCleanlinessMin}
                onChange={(v) => update("ratingCleanlinessMin", v)}
              />
              <NumberField
                label="Localização mín."
                step={0.1}
                value={filter.ratingLocationMin}
                onChange={(v) => update("ratingLocationMin", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Custo-benefício mín."
                step={0.1}
                value={filter.ratingValueMin}
                onChange={(v) => update("ratingValueMin", v)}
              />
              <NumberField
                label="Comunicação mín."
                step={0.1}
                value={filter.ratingCommunicationMin}
                onChange={(v) => update("ratingCommunicationMin", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Avaliação nos últimos (dias)"
                hint="Descarta anúncio morto."
                value={filter.lastReviewWithinDays}
                onChange={(v) => update("lastReviewWithinDays", v)}
              />
              <NumberField
                label="Avaliações/mês mín."
                step={0.1}
                value={filter.reviewsPerMonthMin}
                onChange={(v) => update("reviewsPerMonthMin", v)}
              />
            </Pair>
            <TriStateField
              label="Anúncios sem avaliação"
              value={filter.onlyWithoutReviews}
              onChange={(v) => update("onlyWithoutReviews", v)}
              options={[
                { value: null, label: "Indiferente" },
                { value: true, label: "Só os novos" },
                { value: false, label: "Excluir" },
              ]}
            />
          </Section>

          <Section value="texto" title="Texto das avaliações">
            <TermsField
              label="Avaliações NÃO contêm"
              hint="Exclui o anúncio se qualquer avaliação mencionar um destes termos."
              value={filter.reviewsExcludeTerms}
              preset={REVIEW_EXCLUDE_PRESET}
              onChange={(v) => update("reviewsExcludeTerms", v)}
            />
            <TermsField
              label="Avaliações contêm"
              value={filter.reviewsIncludeTerms}
              preset={REVIEW_INCLUDE_PRESET}
              onChange={(v) => update("reviewsIncludeTerms", v)}
            />
            <TermsField
              label="Descrição contém"
              value={filter.descriptionIncludeTerms}
              onChange={(v) => update("descriptionIncludeTerms", v)}
            />
            <TermsField
              label="Regras da casa NÃO contêm"
              value={filter.houseRulesExcludeTerms}
              onChange={(v) => update("houseRulesExcludeTerms", v)}
            />
            <p className="pt-1 text-[11px] text-muted-foreground">
              Requer enriquecimento: os termos só casam em anúncios cujas
              avaliações já foram ingeridas.
            </p>
          </Section>

          <Section value="amenidades" title="Amenidades">
            <AmenityBuilder
              value={filter.amenities ?? null}
              onChange={(expr) => update("amenities", expr ?? undefined)}
            />
          </Section>

          <Section value="estrutura" title="Estrutura">
            <MultiCheckField
              label="Tipo de acomodação"
              options={ROOM_TYPES.map((type) => ({
                value: type,
                label: roomTypeLabel(type),
              }))}
              value={filter.roomTypes ?? []}
              onChange={(v) => update("roomTypes", v.length ? v : undefined)}
            />
            <MultiCheckField
              label="Excluir tipos"
              options={ROOM_TYPES.map((type) => ({
                value: type,
                label: roomTypeLabel(type),
              }))}
              value={filter.excludeRoomTypes ?? []}
              onChange={(v) => update("excludeRoomTypes", v.length ? v : undefined)}
            />
            <Pair>
              <NumberField
                label="Quartos mín."
                value={filter.bedroomsMin}
                onChange={(v) => update("bedroomsMin", v)}
              />
              <NumberField
                label="Camas mín."
                value={filter.bedsMin}
                onChange={(v) => update("bedsMin", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Banheiros mín."
                step={0.5}
                value={filter.bathroomsMin}
                onChange={(v) => update("bathroomsMin", v)}
              />
              <NumberField
                label="Capacidade mín."
                value={filter.personCapacityMin}
                onChange={(v) => update("personCapacityMin", v)}
              />
            </Pair>
            <Pair>
              <NumberField
                label="Camas por hóspede mín."
                hint="Expõe o anúncio que acomoda 6 em 2 camas + sofá."
                step={0.05}
                value={filter.bedsPerGuestMin}
                onChange={(v) => update("bedsPerGuestMin", v)}
              />
              <NumberField
                label="Mínimo de fotos"
                value={filter.pictureCountMin}
                onChange={(v) => update("pictureCountMin", v)}
              />
            </Pair>
            <CheckField
              label="Banheiro privativo obrigatório"
              checked={filter.requirePrivateBathroom}
              onChange={(v) => update("requirePrivateBathroom", v)}
            />
          </Section>

          <Section value="anfitriao" title="Anfitrião">
            <CheckField
              label="Só Superhost"
              checked={filter.superhostOnly}
              onChange={(v) => update("superhostOnly", v)}
            />
            <div className="space-y-1">
              <Label>Anfitrião cadastrado até</Label>
              <Input
                type="date"
                value={filter.hostSinceBefore ?? ""}
                onChange={(event) =>
                  update("hostSinceBefore", event.target.value || undefined)
                }
              />
            </div>
            <Pair>
              <NumberField
                label="Máx. anúncios do anfitrião"
                hint="Exclui gestoras de portfólio."
                value={filter.hostListingCountMax}
                onChange={(v) => update("hostListingCountMax", v)}
              />
              <NumberField
                label="Mín. anúncios do anfitrião"
                value={filter.hostListingCountMin}
                onChange={(v) => update("hostListingCountMin", v)}
              />
            </Pair>
            <NumberField
              label="Taxa de resposta mín. (%)"
              value={filter.hostResponseRateMin}
              onChange={(v) => update("hostResponseRateMin", v)}
            />
          </Section>

          <Section value="politicas" title="Reserva e políticas">
            <CheckField
              label="Só reserva instantânea"
              checked={filter.instantBookableOnly}
              onChange={(v) => update("instantBookableOnly", v)}
            />
            <div className="space-y-1">
              <Label>Cancelamento no máximo tão restritivo quanto</Label>
              <Select
                value={filter.cancellationAtMost ?? "any"}
                onValueChange={(value) =>
                  update(
                    "cancellationAtMost",
                    value === "any"
                      ? undefined
                      : (value as NonNullable<FilterDefinition["cancellationAtMost"]>),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Indiferente</SelectItem>
                  {CANCELLATION_POLICIES.map((policy) => (
                    <SelectItem key={policy} value={policy}>
                      {policyLabel(policy)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Pair>
              <NumberField
                label="Estadia mínima ≤"
                value={filter.minNightsAtMost}
                onChange={(v) => update("minNightsAtMost", v)}
              />
              <NumberField
                label="Estadia máxima ≥"
                value={filter.maxNightsAtLeast}
                onChange={(v) => update("maxNightsAtLeast", v)}
              />
            </Pair>
          </Section>

          <Section value="geografia" title="Geografia">
            {anchorsSlot}
            {hasAnchors ? (
              <>
                <TriStateField
                  label="Âncoras"
                  value={filter.anchors ? filter.anchors.mode === "and" : null}
                  onChange={(value) =>
                    update(
                      "anchors",
                      value === null
                        ? undefined
                        : {
                            mode: value ? "and" : "or",
                            toleranceM: filter.anchors?.toleranceM ?? 200,
                          },
                    )
                  }
                  options={[
                    { value: null, label: "Ignorar" },
                    { value: true, label: "Perto de todas" },
                    { value: false, label: "Perto de qualquer" },
                  ]}
                />
                <NumberField
                  label="Margem de tolerância (m)"
                  hint="A origem desloca o pino em até ~150 m. Esta margem é somada a cada raio."
                  value={filter.anchors?.toleranceM ?? null}
                  onChange={(value) =>
                    filter.anchors
                      ? update("anchors", {
                          ...filter.anchors,
                          toleranceM: value ?? 200,
                        })
                      : undefined
                  }
                />
              </>
            ) : null}
          </Section>

          <Section value="triagem" title="Triagem">
            <CheckField
              label="Excluir descartados"
              checked={filter.excludeRejected}
              onChange={(v) => update("excludeRejected", v)}
            />
            <CheckField
              label="Só favoritos"
              checked={filter.onlyShortlist}
              onChange={(v) => update("onlyShortlist", v)}
            />
            <CheckField
              label="Ocultar já vistos"
              checked={filter.hideSeen}
              onChange={(v) => update("hideSeen", v)}
            />
          </Section>
        </Accordion>
      </div>
    </div>
  );
}

function Section({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent className="space-y-2.5">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function NumberField({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null | undefined;
  step?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <Label title={hint} className={hint ? "cursor-help underline decoration-dotted" : ""}>
        {label}
      </Label>
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
      />
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean | null | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Checkbox
        checked={checked === true}
        onCheckedChange={(value) => onChange(value === true ? true : undefined)}
      />
      {label}
    </label>
  );
}

function TriStateField<T extends boolean | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: boolean | null; label: string }[];
  onChange: (value: boolean | undefined) => void;
}) {
  const current = value === undefined || value === null ? "null" : String(value);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {options.map((option) => {
          const key = option.value === null ? "null" : String(option.value);
          return (
            <Button
              key={key}
              size="xs"
              variant={current === key ? "default" : "outline"}
              onClick={() =>
                onChange(option.value === null ? undefined : option.value)
              }
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function MultiCheckField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: never[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={value.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(
                  (checked === true
                    ? [...value, option.value]
                    : value.filter((item) => item !== option.value)) as never[],
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TermsField({
  label,
  hint,
  value,
  preset,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[] | null | undefined;
  preset?: string[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [draft, setDraft] = useState((value ?? []).join(", "));

  function commit(next: string) {
    setDraft(next);
    const terms = next
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
    onChange(terms.length ? terms : undefined);
  }

  return (
    <div className="space-y-1">
      <Label title={hint} className={hint ? "cursor-help underline decoration-dotted" : ""}>
        {label}
      </Label>
      <Input
        placeholder="termos separados por vírgula"
        value={draft}
        onChange={(event) => commit(event.target.value)}
      />
      {preset ? (
        <Button
          size="xs"
          variant="ghost"
          className="h-6 px-1 text-[11px]"
          onClick={() => commit(preset.join(", "))}
        >
          usar preset
        </Button>
      ) : null}
    </div>
  );
}

function roomTypeLabel(roomType: string): string {
  switch (roomType) {
    case "entire_home":
      return "Inteiro";
    case "private_room":
      return "Quarto privativo";
    case "shared_room":
      return "Compartilhado";
    case "hotel_room":
      return "Hotel";
    default:
      return roomType;
  }
}

function policyLabel(policy: string): string {
  switch (policy) {
    case "flexible":
      return "Flexível";
    case "moderate":
      return "Moderada";
    case "strict":
      return "Rigorosa";
    case "super_strict":
      return "Super rigorosa";
    default:
      return policy;
  }
}
