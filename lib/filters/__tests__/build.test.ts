import { describe, expect, it } from "vitest";
import {
  allowedPolicies,
  buildAmenityExpr,
  buildCountQuery,
  buildDiagnosticQuery,
  buildFilterQuery,
} from "../build";
import { SqlBuilder } from "../sql";
import { filterDefinitionSchema, type FilterDefinition } from "../types";

const SEARCH_ID = "11111111-1111-4111-8111-111111111111";

function build(filter: FilterDefinition) {
  return buildFilterQuery({ searchId: SEARCH_ID, filter });
}

/**
 * Nenhum valor vindo do usuário pode aparecer no texto — só placeholders.
 *
 * A checagem recebe os valores explicitamente em vez de varrer `params`:
 * números como 0 e 1 aparecem legitimamente no SQL escrito à mão
 * (`nullif(x, 0)`), então varrer tudo produziria falso positivo.
 */
function assertParameterized(
  built: { text: string; params: unknown[] },
  values: (number | string)[],
) {
  for (const value of values) {
    expect(built.params).toContain(value);
    if (typeof value === "number") {
      expect(built.text).not.toMatch(new RegExp(`(?<![$\\w.])${value}(?![\\w.])`));
    } else {
      expect(built.text).not.toContain(value);
    }
  }
}

describe("estrutura da consulta", () => {
  it("parte do snapshot mais recente de cada anúncio na busca", () => {
    const { text, params } = build({});
    expect(text).toContain("with ultimo_snapshot as");
    expect(text).toContain("distinct on (listing_id)");
    expect(text).toContain("order by listing_id, captured_at desc");
    expect(params[0]).toBe(SEARCH_ID);
  });

  it("sem filtro nenhum, não restringe nada", () => {
    const { predicates, text } = build({});
    expect(predicates).toHaveLength(0);
    expect(text).toContain("where true");
  });

  it("expõe as colunas derivadas que a tabela mostra", () => {
    const { text } = build({});
    expect(text).toContain("as cleaning_ratio");
    expect(text).toContain("as price_honesty");
    expect(text).toContain("as snapshot_count");
    expect(text).toContain("as min_anchor_distance_m");
  });

  it("só ordena por coluna da lista fixa", () => {
    const asc = buildFilterQuery({ searchId: SEARCH_ID, filter: {}, orderBy: "rating_overall", orderDir: "desc" });
    expect(asc.text).toContain("order by l.rating_overall desc nulls last");
  });
});

describe("7.1 preço", () => {
  it("filtra pela diária efetiva, não pela anunciada", () => {
    const built = build({ effectiveNightlyMax: 450 });
    expect(built.text).toContain("s.effective_nightly <= $2");
    assertParameterized(built, [450]);
  });

  it("razão limpeza/total protege contra divisão por zero", () => {
    const { text } = build({ cleaningRatioMax: 0.25 });
    expect(text).toContain("s.cleaning_fee / nullif(s.total_price, 0) <= $2");
  });

  it("delta vs. diária anunciada mede o quanto o anúncio mente", () => {
    const { text } = build({ priceHonestyMax: 1.3 });
    expect(text).toContain("s.effective_nightly / nullif(s.gross_nightly, 0) <= $2");
  });

  it("desconto aceita valor gravado com qualquer sinal", () => {
    const { text } = build({ onlyWithDiscount: true });
    expect(text).toContain("coalesce(abs(s.discount_total), 0) > 0");
  });
});

describe("7.2 avaliações", () => {
  it("combina sub-notas, volume e recência numa consulta só", () => {
    const filter: FilterDefinition = {
      ratingCleanlinessMin: 4.8,
      ratingLocationMin: 4.7,
      reviewCountMin: 30,
      lastReviewWithinDays: 90,
    };
    const { text, params, predicates } = build(filter);

    expect(predicates.map((p) => p.key)).toEqual([
      "ratingCleanlinessMin",
      "ratingLocationMin",
      "reviewCountMin",
      "lastReviewWithinDays",
    ]);
    expect(text).toContain("l.rating_cleanliness >= $2");
    expect(text).toContain("l.rating_location >= $3");
    expect(text).toContain("l.review_count >= $4");
    expect(text).toContain("l.last_review_at >= current_date - $5::int");
    expect(params).toEqual([SEARCH_ID, 4.8, 4.7, 30, 90, 500, 0]);
  });

  it("anúncio novo pode ser incluído ou excluído explicitamente", () => {
    expect(build({ onlyWithoutReviews: true }).text).toContain(
      "coalesce(l.review_count, 0) = 0",
    );
    expect(build({ onlyWithoutReviews: false }).text).toContain(
      "coalesce(l.review_count, 0) > 0",
    );
    expect(build({}).predicates).toHaveLength(0);
  });
});

describe("7.3 texto", () => {
  it("exclui anúncios cujas avaliações mencionam os termos", () => {
    const { text, params } = build({ reviewsExcludeTerms: ["barulho", "mofo"] });
    expect(text).toContain("not exists");
    expect(text).toContain("r.tsv @@ plainto_tsquery('portuguese', termo)");
    expect(params).toContainEqual(["barulho", "mofo"]);
  });

  it("cada termo vira um tsquery próprio, nunca string concatenada", () => {
    const { text } = build({ reviewsIncludeTerms: ["silencioso & ' | drop"] });
    expect(text).not.toContain("drop");
    expect(text).toContain("unnest($2::text[])");
  });

  it("cobre descrição e regras da casa nos dois sentidos", () => {
    expect(build({ descriptionIncludeTerms: ["reformado"] }).text).toContain(
      "to_tsvector('portuguese', coalesce(l.description, ''))",
    );
    expect(build({ houseRulesExcludeTerms: ["festa"] }).text).toContain(
      "coalesce(l.house_rules, '')",
    );
  });
});

describe("7.4 amenidades com lógica booleana", () => {
  it("traduz has para contenção de array", () => {
    const builder = new SqlBuilder();
    expect(buildAmenityExpr({ op: "has", amenity: "washer" }, builder)).toBe(
      "l.amenities @> array[$1]::text[]",
    );
    expect(builder.params).toEqual(["washer"]);
  });

  it("monta ar_condicionado AND (lavadora OR secadora) AND NOT banheiro_compartilhado", () => {
    const filter: FilterDefinition = {
      amenities: {
        op: "and",
        children: [
          { op: "has", amenity: "air_conditioning" },
          {
            op: "or",
            children: [
              { op: "has", amenity: "washer" },
              { op: "has", amenity: "dryer" },
            ],
          },
          { op: "not", child: { op: "has", amenity: "shared_bathroom" } },
        ],
      },
    };

    const { text, params } = build(filter);
    expect(text).toContain(
      "(l.amenities @> array[$2]::text[] and (l.amenities @> array[$3]::text[] or l.amenities @> array[$4]::text[]) and (not l.amenities @> array[$5]::text[]))",
    );
    expect(params.slice(1, 5)).toEqual([
      "air_conditioning",
      "washer",
      "dryer",
      "shared_bathroom",
    ]);
  });

  it("aceita aninhamento profundo", () => {
    const builder = new SqlBuilder();
    const sql = buildAmenityExpr(
      {
        op: "or",
        children: [
          { op: "and", children: [{ op: "has", amenity: "pool" }, { op: "has", amenity: "gym" }] },
          { op: "not", child: { op: "or", children: [{ op: "has", amenity: "tv" }] } },
        ],
      },
      builder,
    );
    expect(sql).toBe(
      "((l.amenities @> array[$1]::text[] and l.amenities @> array[$2]::text[]) or (not (l.amenities @> array[$3]::text[])))",
    );
  });

  it("o schema recusa amenidade fora do vocabulário canônico", () => {
    const result = filterDefinitionSchema.safeParse({
      amenities: { op: "has", amenity: "vaso_de_samambaia" },
    });
    expect(result.success).toBe(false);
  });
});

describe("7.5 estrutura", () => {
  it("exclui hotel e quarto compartilhado sem descartar tipo desconhecido", () => {
    const { text } = build({ excludeRoomTypes: ["hotel_room", "shared_room"] });
    expect(text).toContain("l.room_type is null or l.room_type <> all($2::text[])");
  });

  it("razão camas/hóspedes expõe o anúncio que acomoda 6 em 2 camas", () => {
    const { text } = build({ bedsPerGuestMin: 0.75 });
    expect(text).toContain("l.beds::numeric / nullif(l.person_capacity, 0) >= $2");
  });

  it("banheiro privativo checa a flag e a amenidade", () => {
    const { text } = build({ requirePrivateBathroom: true });
    expect(text).toContain("coalesce(l.is_shared_bathroom, false) = false");
    expect(text).toContain("not (l.amenities @> array['shared_bathroom']::text[])");
  });
});

describe("7.6 anfitrião", () => {
  it("teto de anúncios exclui gestoras de portfólio", () => {
    const { text, params } = build({ hostListingCountMax: 3 });
    expect(text).toContain("l.host_listing_count <= $2");
    expect(params).toContain(3);
  });

  it("tempo de cadastro compara como data", () => {
    const { text } = build({ hostSinceBefore: "2022-01-01" });
    expect(text).toContain("l.host_since <= $2::date");
  });
});

describe("7.7 políticas", () => {
  it("escala ordenada: 'no máximo moderada' aceita flexível e moderada", () => {
    expect(allowedPolicies("moderate")).toEqual(["flexible", "moderate"]);
    expect(allowedPolicies("super_strict")).toHaveLength(4);
    expect(allowedPolicies("flexible")).toEqual(["flexible"]);
  });

  it("não descarta anúncio com política desconhecida", () => {
    const { text } = build({ cancellationAtMost: "moderate" });
    expect(text).toContain("l.cancellation_policy is null or");
  });
});

describe("7.8 geografia", () => {
  it("AND: nenhuma âncora pode ficar longe", () => {
    const { text } = build({ anchors: { mode: "and", toleranceM: 200 } });
    expect(text).toContain("not exists (select 1 from anchors a");
    expect(text).toContain("and not extensions.ST_DWithin(l.geo, a.geo, a.max_distance_m + $2)");
  });

  it("OR: basta uma âncora perto", () => {
    const { text } = build({ anchors: { mode: "or", toleranceM: 200 } });
    expect(text).toContain("exists (select 1 from anchors a");
    expect(text).not.toContain("and not extensions.ST_DWithin");
  });

  it("soma a margem de tolerância contra a ofuscação do pino", () => {
    const { params } = build({ anchors: { mode: "and", toleranceM: 350 } });
    expect(params).toContain(350);
  });

  it("restringe a âncoras específicas quando pedido", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const { text, params } = build({ anchors: { mode: "and", toleranceM: 200, ids: [id] } });
    expect(text).toContain("a.id = any($3::uuid[])");
    expect(params).toContainEqual([id]);
  });

  it("exclusão por raio afasta de área ruidosa", () => {
    const built = build({
      excludeRadius: [{ lat: 38.71, lng: -9.14, minDistanceM: 400 }],
    });
    expect(built.text).toContain(
      "not extensions.ST_DWithin(l.geo, extensions.ST_SetSRID",
    );
    assertParameterized(built, [400, 38.71, -9.14]);
  });

  it("polígono fecha o anel e vai como parâmetro", () => {
    const { text, params } = build({
      polygon: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
        { lat: 5, lng: 6 },
      ],
    });
    expect(text).toContain("extensions.ST_Within");
    expect(params).toContain("POLYGON((2 1,4 3,6 5,2 1))");
  });
});

describe("7.9 triagem", () => {
  it("exclui descartados sem perder quem não tem veredito", () => {
    const { text } = build({ excludeRejected: true });
    expect(text).toContain("coalesce(v.verdict, '') <> 'rejected'");
  });

  it("shortlist e já vistos", () => {
    expect(build({ onlyShortlist: true }).text).toContain("v.verdict = 'shortlist'");
    expect(build({ hideSeen: true }).text).toContain("v.verdict is null");
  });
});

describe("consultas auxiliares", () => {
  it("contagem ao vivo usa os mesmos predicados", () => {
    const filter: FilterDefinition = { ratingOverallMin: 4.5, superhostOnly: true };
    const full = build(filter);
    const count = buildCountQuery(SEARCH_ID, filter);

    expect(count.text).toContain("count(*)::int as total");
    expect(count.predicates.map((p) => p.key)).toEqual(
      full.predicates.map((p) => p.key),
    );
  });

  it("diagnóstico conta cada filtro isoladamente, para dizer qual zerou", () => {
    const { text, predicates } = buildDiagnosticQuery(SEARCH_ID, {
      ratingOverallMin: 4.9,
      reviewCountMin: 500,
    });
    expect(predicates).toHaveLength(2);
    expect(text).toContain("count(*) filter (where l.rating_overall >= $2)::int as p0");
    expect(text).toContain("count(*) filter (where l.review_count >= $3)::int as p1");
    expect(text).toContain("count(*)::int as base");
  });

  it("diagnóstico sem filtro nenhum ainda é SQL válido", () => {
    const { text } = buildDiagnosticQuery(SEARCH_ID, {});
    expect(text).toContain("count(*)::int as base");
    expect(text).not.toContain("as p0");
  });
});

describe("o critério de aceite de §14, em uma consulta", () => {
  it("limpeza ≥ 4,8 E localização ≥ 4,7 E ≥ 30 avaliações E última nos 90 dias", () => {
    const filter = filterDefinitionSchema.parse({
      ratingCleanlinessMin: 4.8,
      ratingLocationMin: 4.7,
      reviewCountMin: 30,
      lastReviewWithinDays: 90,
    });
    const { text, predicates } = build(filter);

    expect(predicates).toHaveLength(4);
    // Todos ligados por AND numa única cláusula WHERE (a última do texto: a
    // primeira pertence ao CTE do snapshot).
    const whereClause = text
      .slice(text.lastIndexOf("\nwhere "))
      .split("order by")[0];
    expect(whereClause.match(/\band\b/g)).toHaveLength(3);
  });
});
