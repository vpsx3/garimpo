import {
  CRITERION_LABELS,
  LOWER_IS_BETTER,
  SCORING_CRITERIA,
  type ScoringCriterion,
  type ScoringWeights,
} from "./types";

/**
 * Motor de pontuação (§9).
 *
 * Soma ponderada de critérios normalizados para [0,1]. A normalização é
 * min-max **dentro do conjunto de resultados atual**, não em escala absoluta:
 * o objetivo é comparar as opções disponíveis entre si, não medi-las contra
 * um ideal platônico. Trocar o filtro muda o conjunto e, portanto, os scores
 * — isso é o comportamento desejado, não um bug.
 */

export type ScoreComponent = {
  key: ScoringCriterion;
  label: string;
  /** Valor bruto do critério para esta linha. */
  raw: number | null;
  /** Posição na escala do conjunto, já orientada (1 = melhor). */
  normalized: number;
  weight: number;
  /** Quanto este critério contribuiu para o score final. */
  contribution: number;
};

export type Scorable = Record<string, unknown>;

export type Scored<T> = T & {
  score: number;
  score_breakdown: ScoreComponent[];
};

/** `review_count` satura: 500 vs. 800 avaliações é diferença irrelevante. */
const LOG_SATURATED: ScoringCriterion[] = ["review_count", "reviews_per_month"];

function readCriterion(row: Scorable, criterion: ScoringCriterion): number | null {
  const value =
    criterion === "anchor_distance"
      ? weightedAnchorDistance(row)
      : row[criterion];

  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Distância usada no score: a da âncora com peso > 0. Se mais de uma tiver
 * peso, vale a maior distância — o anúncio é tão bom quanto sua pior âncora.
 * Sem âncora com peso, cai para a distância mínima já calculada na consulta.
 */
function weightedAnchorDistance(row: Scorable): number | null {
  const distances = row.anchor_distances;
  if (Array.isArray(distances) && distances.length > 0) {
    const weighted = distances
      .map((entry) => entry as { meters?: number; weight?: number })
      .filter((entry) => typeof entry.meters === "number");
    if (weighted.length > 0) {
      return Math.max(...weighted.map((entry) => entry.meters!));
    }
  }
  const fallback = row.min_anchor_distance_m;
  return typeof fallback === "number" ? fallback : null;
}

export function scoreResults<T extends Scorable>(
  rows: T[],
  weights: ScoringWeights,
  options: { sort?: boolean } = {},
): (T | Scored<T>)[] {
  const active = SCORING_CRITERIA.filter(
    (criterion) => (weights[criterion] ?? 0) > 0,
  );

  if (rows.length === 0 || active.length === 0) return rows;

  // Escalas min-max por critério, sobre o conjunto atual.
  const scales = new Map<ScoringCriterion, { min: number; max: number }>();
  const values = new Map<ScoringCriterion, (number | null)[]>();

  for (const criterion of active) {
    const raw = rows.map((row) => {
      const value = readCriterion(row, criterion);
      if (value === null) return null;
      return LOG_SATURATED.includes(criterion) ? Math.log1p(Math.max(0, value)) : value;
    });
    values.set(criterion, raw);

    const present = raw.filter((value): value is number => value !== null);
    if (present.length > 0) {
      scales.set(criterion, {
        min: Math.min(...present),
        max: Math.max(...present),
      });
    }
  }

  const totalWeight = active.reduce(
    (sum, criterion) => sum + (weights[criterion] ?? 0),
    0,
  );

  const scored = rows.map((row, index) => {
    const breakdown: ScoreComponent[] = [];
    let score = 0;

    for (const criterion of active) {
      const weight = weights[criterion] ?? 0;
      const scale = scales.get(criterion);
      const transformed = values.get(criterion)?.[index] ?? null;
      const raw = readCriterion(row, criterion);

      // Sem valor, o critério vale 0,5: nem premia nem pune o dado ausente.
      // Zerar seria punir o anúncio por uma lacuna da origem.
      let normalized = 0.5;

      if (scale && transformed !== null) {
        const span = scale.max - scale.min;
        if (span === 0) {
          // Todos empatados nesse critério: ele não diferencia ninguém, então
          // não pode penalizar ninguém. A inversão fica de fora de propósito.
          normalized = 1;
        } else {
          normalized = (transformed - scale.min) / span;
          if (LOWER_IS_BETTER.includes(criterion)) normalized = 1 - normalized;
        }
      }

      const contribution = (normalized * weight) / totalWeight;
      score += contribution;

      breakdown.push({
        key: criterion,
        label: CRITERION_LABELS[criterion],
        raw,
        normalized: round4(normalized),
        weight,
        contribution: round4(contribution),
      });
    }

    return {
      ...row,
      score: round4(score),
      score_breakdown: breakdown.sort((a, b) => b.contribution - a.contribution),
    } as Scored<T>;
  });

  if (options.sort) scored.sort((a, b) => b.score - a.score);
  return scored;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Presets de peso de §9. */
export const SCORING_PRESETS: Record<string, { label: string; weights: ScoringWeights }> = {
  custo_beneficio: {
    label: "Custo-benefício",
    weights: {
      effective_nightly: 5,
      rating_overall: 3,
      review_count: 2,
      rating_cleanliness: 1,
    },
  },
  qualidade: {
    label: "Qualidade acima de tudo",
    weights: {
      rating_overall: 5,
      rating_cleanliness: 4,
      review_count: 3,
      reviews_per_month: 2,
      effective_nightly: 1,
    },
  },
  localizacao: {
    label: "Localização é rei",
    weights: {
      anchor_distance: 5,
      rating_location: 4,
      rating_overall: 2,
      effective_nightly: 2,
    },
  },
  estadia_longa: {
    label: "Estadia longa",
    weights: {
      // Numa estadia longa a taxa de limpeza dilui, então o que pesa é a
      // diária efetiva — que já embute essa diluição — mais espaço e trabalho.
      effective_nightly: 5,
      beds_per_guest: 3,
      rating_cleanliness: 3,
      rating_overall: 2,
      review_count: 1,
    },
  },
};
