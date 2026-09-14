import { describe, expect, it } from "vitest";
import { SCORING_PRESETS, scoreResults, type Scored } from "../engine";

type Row = {
  id: string;
  effective_nightly: number | null;
  rating_overall: number | null;
  review_count: number | null;
  min_anchor_distance_m?: number | null;
  beds_per_guest?: number | null;
};

const rows: Row[] = [
  { id: "barato", effective_nightly: 200, rating_overall: 4.2, review_count: 10 },
  { id: "medio", effective_nightly: 400, rating_overall: 4.6, review_count: 120 },
  { id: "caro", effective_nightly: 800, rating_overall: 4.9, review_count: 500 },
];

function scored(weights: Parameters<typeof scoreResults>[1], input = rows) {
  return scoreResults(input, weights, { sort: true }) as Scored<Row>[];
}

describe("orientação dos critérios", () => {
  it("menor diária efetiva é melhor", () => {
    const result = scored({ effective_nightly: 1 });
    expect(result[0].id).toBe("barato");
    expect(result[0].score).toBe(1);
    expect(result[2].id).toBe("caro");
    expect(result[2].score).toBe(0);
  });

  it("maior nota é melhor", () => {
    const result = scored({ rating_overall: 1 });
    expect(result[0].id).toBe("caro");
  });

  it("menor distância é melhor", () => {
    const withDistance = rows.map((row, index) => ({
      ...row,
      min_anchor_distance_m: [1500, 400, 900][index],
    }));
    const result = scored({ anchor_distance: 1 }, withDistance);
    expect(result[0].id).toBe("medio");
  });
});

describe("normalização", () => {
  it("é min-max dentro do conjunto atual, não em escala absoluta", () => {
    const doisBaratos = scored({ effective_nightly: 1 }, rows.slice(0, 2));
    // Com só dois itens, o mais caro dos dois vira o pior do conjunto.
    expect(doisBaratos[0].id).toBe("barato");
    expect(doisBaratos[1].score).toBe(0);
  });

  it("conjunto sem variação não quebra a divisão", () => {
    const iguais = [
      { id: "a", effective_nightly: 300, rating_overall: 4.5, review_count: 50 },
      { id: "b", effective_nightly: 300, rating_overall: 4.5, review_count: 50 },
    ];
    const result = scored({ effective_nightly: 1 }, iguais);
    expect(result.every((row) => row.score === 1)).toBe(true);
  });

  it("review_count satura: a diferença entre 500 e 800 é quase nada", () => {
    const grandes = [
      { id: "cem", effective_nightly: 300, rating_overall: 4.5, review_count: 100 },
      { id: "quinhentos", effective_nightly: 300, rating_overall: 4.5, review_count: 500 },
      { id: "oitocentos", effective_nightly: 300, rating_overall: 4.5, review_count: 800 },
    ];
    const result = scoreResults(grandes, { review_count: 1 }) as Scored<Row>[];
    const byId = Object.fromEntries(result.map((row) => [row.id, row.score]));

    const saltoPequeno = byId.oitocentos - byId.quinhentos;
    const saltoGrande = byId.quinhentos - byId.cem;
    // Sem log, 500→800 seria quase metade da escala. Com log, é marginal.
    expect(saltoPequeno).toBeLessThan(saltoGrande / 2);
  });
});

describe("dados ausentes", () => {
  it("critério sem valor vale 0,5: não premia nem pune a lacuna da origem", () => {
    const comBuraco = [
      { id: "tem", effective_nightly: 300, rating_overall: 4.9, review_count: 100 },
      { id: "nao_tem", effective_nightly: 300, rating_overall: null, review_count: 100 },
      { id: "ruim", effective_nightly: 300, rating_overall: 4.0, review_count: 100 },
    ];
    const result = scoreResults(comBuraco, { rating_overall: 1 }) as Scored<Row>[];
    const semNota = result.find((row) => row.id === "nao_tem")!;
    expect(semNota.score).toBe(0.5);
    expect(result.find((row) => row.id === "tem")!.score).toBe(1);
    expect(result.find((row) => row.id === "ruim")!.score).toBe(0);
  });
});

describe("decomposição", () => {
  it("as contribuições somam o score", () => {
    const result = scored({ effective_nightly: 3, rating_overall: 1 });
    for (const row of result) {
      const soma = row.score_breakdown.reduce((acc, part) => acc + part.contribution, 0);
      expect(soma).toBeCloseTo(row.score, 3);
    }
  });

  it("vem ordenada pela maior contribuição, para o hover ser útil", () => {
    const [top] = scored({ effective_nightly: 5, rating_overall: 1 });
    const contribuicoes = top.score_breakdown.map((part) => part.contribution);
    expect([...contribuicoes].sort((a, b) => b - a)).toEqual(contribuicoes);
  });

  it("guarda o valor bruto de cada critério", () => {
    const [top] = scored({ effective_nightly: 1 });
    const parte = top.score_breakdown.find((p) => p.key === "effective_nightly")!;
    expect(parte.raw).toBe(200);
    expect(parte.weight).toBe(1);
  });

  it("só inclui critérios com peso", () => {
    const [top] = scored({ effective_nightly: 1 });
    expect(top.score_breakdown).toHaveLength(1);
  });
});

describe("pesos", () => {
  it("peso maior domina o resultado", () => {
    const precoManda = scored({ effective_nightly: 10, rating_overall: 1 });
    const notaManda = scored({ effective_nightly: 1, rating_overall: 10 });
    expect(precoManda[0].id).toBe("barato");
    expect(notaManda[0].id).toBe("caro");
  });

  it("sem peso nenhum, não pontua nada", () => {
    const result = scoreResults(rows, {});
    expect(result[0]).not.toHaveProperty("score");
  });

  it("conjunto vazio não quebra", () => {
    expect(scoreResults([], { effective_nightly: 1 })).toEqual([]);
  });
});

describe("presets", () => {
  it("os quatro presets de §9 existem e têm pesos", () => {
    expect(Object.keys(SCORING_PRESETS)).toEqual([
      "custo_beneficio",
      "qualidade",
      "localizacao",
      "estadia_longa",
    ]);
    for (const preset of Object.values(SCORING_PRESETS)) {
      expect(Object.values(preset.weights).some((weight) => (weight ?? 0) > 0)).toBe(true);
    }
  });

  it("presets diferentes ranqueiam diferente", () => {
    const custo = scored(SCORING_PRESETS.custo_beneficio.weights);
    const qualidade = scored(SCORING_PRESETS.qualidade.weights);
    expect(custo[0].id).not.toBe(qualidade[0].id);
  });
});
