import { z } from "zod";

/**
 * Pesos do motor de pontuação (§9).
 *
 * O tipo vive aqui, separado do motor, porque `filter_sets.scoring_weights`
 * persiste esses pesos junto com a definição de filtros desde a Etapa 1.
 */

export const SCORING_CRITERIA = [
  "effective_nightly",
  "rating_overall",
  "rating_cleanliness",
  "rating_location",
  "review_count",
  "reviews_per_month",
  "beds_per_guest",
  "anchor_distance",
  "picture_count",
] as const;

export type ScoringCriterion = (typeof SCORING_CRITERIA)[number];

export const scoringWeightsSchema = z
  .object(
    Object.fromEntries(
      SCORING_CRITERIA.map((criterion) => [
        criterion,
        z.number().min(0).max(10).default(0),
      ]),
    ) as Record<ScoringCriterion, z.ZodDefault<z.ZodNumber>>,
  )
  .partial();

export type ScoringWeights = Partial<Record<ScoringCriterion, number>>;

/** Critérios em que menor é melhor. */
export const LOWER_IS_BETTER: ScoringCriterion[] = [
  "effective_nightly",
  "anchor_distance",
];

export const CRITERION_LABELS: Record<ScoringCriterion, string> = {
  effective_nightly: "Diária efetiva",
  rating_overall: "Nota geral",
  rating_cleanliness: "Limpeza",
  rating_location: "Localização",
  review_count: "Volume de avaliações",
  reviews_per_month: "Avaliações por mês",
  beds_per_guest: "Camas por hóspede",
  anchor_distance: "Distância às âncoras",
  picture_count: "Quantidade de fotos",
};
