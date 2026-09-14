import { z } from "zod";
import { AMENITY_KEYS } from "@/lib/amenities/canonical";

/**
 * `FilterDefinition` — o catálogo de §7 como objeto serializável.
 *
 * Tudo é opcional e combinável: é essa composição que os filtros nativos da
 * origem não oferecem. A definição é salva em `filter_sets.definition` e
 * traduzida para SQL parametrizado por `build.ts`.
 */

const amenityKey = z.enum(AMENITY_KEYS);

export type AmenityExpr =
  | { op: "has"; amenity: string }
  | { op: "and"; children: AmenityExpr[] }
  | { op: "or"; children: AmenityExpr[] }
  | { op: "not"; child: AmenityExpr };

export const amenityExprSchema: z.ZodType<AmenityExpr> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("has"), amenity: amenityKey }),
    z.object({ op: z.literal("and"), children: z.array(amenityExprSchema).min(1) }),
    z.object({ op: z.literal("or"), children: z.array(amenityExprSchema).min(1) }),
    z.object({ op: z.literal("not"), child: amenityExprSchema }),
  ]),
);

export const ROOM_TYPES = [
  "entire_home",
  "private_room",
  "shared_room",
  "hotel_room",
] as const;

export const CANCELLATION_POLICIES = [
  "flexible",
  "moderate",
  "strict",
  "super_strict",
] as const;

export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

/** Escala ordenada de §7.7, para "no máximo tão restritiva quanto X". */
export const CANCELLATION_RANK: Record<CancellationPolicy, number> = {
  flexible: 0,
  moderate: 1,
  strict: 2,
  super_strict: 3,
};

const positive = z.number().positive();
const rating = z.number().min(0).max(5);

export const filterDefinitionSchema = z
  .object({
    // 7.1 Preço
    effectiveNightlyMin: positive.nullish(),
    effectiveNightlyMax: positive.nullish(),
    totalPriceMin: positive.nullish(),
    totalPriceMax: positive.nullish(),
    pricePerPersonMax: positive.nullish(),
    cleaningFeeMax: positive.nullish(),
    /** Razão limpeza/total, 0–1. Expõe quem esconde preço na limpeza. */
    cleaningRatioMax: z.number().min(0).max(1).nullish(),
    onlyWithDiscount: z.boolean().nullish(),
    /** effective_nightly / gross_nightly: quanto o anúncio mente. */
    priceHonestyMax: z.number().min(1).nullish(),

    // 7.2 Avaliações
    ratingOverallMin: rating.nullish(),
    ratingCleanlinessMin: rating.nullish(),
    ratingLocationMin: rating.nullish(),
    ratingValueMin: rating.nullish(),
    ratingCheckinMin: rating.nullish(),
    ratingCommunicationMin: rating.nullish(),
    ratingAccuracyMin: rating.nullish(),
    reviewCountMin: z.number().int().min(0).nullish(),
    /** Última avaliação nos últimos N dias. Descarta anúncio morto. */
    lastReviewWithinDays: z.number().int().positive().nullish(),
    reviewsPerMonthMin: z.number().min(0).nullish(),
    /** null = indiferente, true = só sem avaliação, false = exclui os sem. */
    onlyWithoutReviews: z.boolean().nullish(),

    // 7.3 Texto (Etapa 6)
    reviewsExcludeTerms: z.array(z.string().trim().min(2)).nullish(),
    reviewsIncludeTerms: z.array(z.string().trim().min(2)).nullish(),
    descriptionIncludeTerms: z.array(z.string().trim().min(2)).nullish(),
    descriptionExcludeTerms: z.array(z.string().trim().min(2)).nullish(),
    houseRulesIncludeTerms: z.array(z.string().trim().min(2)).nullish(),
    houseRulesExcludeTerms: z.array(z.string().trim().min(2)).nullish(),

    /**
     * Busca livre por palavra-chave sobre título, descrição, amenidades e
     * regras da casa. Existe porque o vocabulário canônico é fechado: "sauna"
     * e "quadra de tênis" não viram chave, mas aparecem no texto do anúncio.
     */
    keywords: z.array(z.string().trim().min(2)).nullish(),
    /** "all" exige todas as palavras; "any" basta uma. Padrão: "all". */
    keywordsMode: z.enum(["all", "any"]).nullish(),

    // 7.4 Amenidades
    amenities: amenityExprSchema.nullish(),

    // 7.5 Estrutura
    roomTypes: z.array(z.enum(ROOM_TYPES)).nullish(),
    excludeRoomTypes: z.array(z.enum(ROOM_TYPES)).nullish(),
    bedroomsMin: z.number().int().min(0).nullish(),
    bedroomsMax: z.number().int().min(0).nullish(),
    bedsMin: z.number().int().min(0).nullish(),
    bathroomsMin: z.number().min(0).nullish(),
    requirePrivateBathroom: z.boolean().nullish(),
    personCapacityMin: z.number().int().min(1).nullish(),
    /** Expõe o anúncio que acomoda 6 em 2 camas + sofá. */
    bedsPerGuestMin: z.number().positive().nullish(),
    pictureCountMin: z.number().int().min(0).nullish(),

    // 7.6 Anfitrião
    superhostOnly: z.boolean().nullish(),
    hostSinceBefore: z.string().nullish(),
    /** Teto de anúncios do anfitrião: exclui gestoras de portfólio. */
    hostListingCountMax: z.number().int().positive().nullish(),
    hostListingCountMin: z.number().int().positive().nullish(),
    hostResponseRateMin: z.number().int().min(0).max(100).nullish(),

    // 7.7 Reserva e políticas
    instantBookableOnly: z.boolean().nullish(),
    cancellationAtMost: z.enum(CANCELLATION_POLICIES).nullish(),
    minNightsAtMost: z.number().int().positive().nullish(),
    maxNightsAtLeast: z.number().int().positive().nullish(),

    // 7.8 Geografia
    anchors: z
      .object({
        mode: z.enum(["and", "or"]).default("and"),
        /** Margem somada ao raio, contra a ofuscação do pino da origem. */
        toleranceM: z.number().int().min(0).default(200),
        ids: z.array(z.string().uuid()).nullish(),
      })
      .nullish(),
    excludeRadius: z
      .array(
        z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          minDistanceM: z.number().int().positive(),
        }),
      )
      .nullish(),
    polygon: z
      .array(z.object({ lat: z.number(), lng: z.number() }))
      .min(3)
      .nullish(),

    // 7.9 Triagem
    excludeRejected: z.boolean().nullish(),
    onlyShortlist: z.boolean().nullish(),
    hideSeen: z.boolean().nullish(),

    // Disponibilidade
    onlyAvailable: z.boolean().nullish(),
  })
  .strict();

export type FilterDefinition = z.infer<typeof filterDefinitionSchema>;

export const EMPTY_FILTER: FilterDefinition = {};

/** Presets de §7.3. */
export const REVIEW_EXCLUDE_PRESET = [
  "barulho",
  "barulhento",
  "mofo",
  "cheiro",
  "infiltração",
  "obra",
  "sujo",
  "inseguro",
  "escuro",
];

export const REVIEW_INCLUDE_PRESET = [
  "silencioso",
  "tranquilo",
  "reformado",
  "impecável",
  "vista",
];
