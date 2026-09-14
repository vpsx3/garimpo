import { describe, expect, it } from "vitest";
import {
  allowedPolicies,
  applyFilter,
  hasContent,
  matchedKeywords,
  matchesKeyword,
  attachAnchorLimits,
  evaluateAmenityExpr,
  haversineMeters,
  pointInPolygon,
  type Row,
} from "../apply";
import { filterDefinitionSchema, type FilterDefinition } from "../types";

function row(overrides: Partial<Row> = {}): Row {
  return {
    externalId: "1",
    title: "Anúncio",
    url: null,
    roomType: "entire_home",
    propertyType: null,
    personCapacity: 4,
    bedrooms: 2,
    beds: 3,
    bathrooms: 1,
    isSharedBathroom: false,
    lat: 38.72,
    lng: -9.14,
    pictureCount: 10,
    pictureUrls: null,
    ratingOverall: 4.8,
    reviewCount: 100,
    isSuperhost: true,
    hostName: null,
    amenities: ["air_conditioning", "washer"],
    amenityLabels: ["Ar-condicionado", "Máquina de lavar"],
    instantBookable: true,
    minNights: 2,
    maxNights: 30,
    grossNightly: 200,
    announcedTotal: 1000,
    currency: "BRL",
    nights: 5,
    guests: 4,
    effectiveNightly: 200,
    totalPrice: 1000,
    cleaningFee: null,
    serviceFee: null,
    taxes: null,
    discountTotal: null,
    pricePerPerson: 250,
    isAvailable: true,
    priceSource: "search",
    cleaningRatio: null,
    priceHonesty: null,
    bedsPerGuest: 0.75,
    description: null,
    houseRules: null,
    ratingCleanliness: 4.9,
    ratingAccuracy: null,
    ratingCheckin: null,
    ratingCommunication: null,
    ratingLocation: 4.8,
    ratingValue: null,
    lastReviewAt: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10),
    reviewsPerMonth: 2,
    hostSince: "2019-01-01",
    hostListingCount: 2,
    hostResponseRate: 100,
    cancellationPolicy: "moderate",
    reviews: [],
    anchorDistances: [],
    minAnchorDistanceM: null,
    verdict: null,
    ...overrides,
  };
}

function keep(rows: Row[], filter: FilterDefinition): string[] {
  return applyFilter(rows, filter).rows.map((r) => r.externalId);
}

describe("preço", () => {
  it("filtra pela diária efetiva", () => {
    const rows = [
      row({ externalId: "barato", effectiveNightly: 200 }),
      row({ externalId: "caro", effectiveNightly: 900 }),
    ];
    expect(keep(rows, { effectiveNightlyMax: 450 })).toEqual(["barato"]);
  });

  it("razão limpeza/total e delta vs. anunciada", () => {
    const rows = [
      row({ externalId: "honesto", cleaningRatio: 0.05, priceHonesty: 1.1 }),
      row({ externalId: "escondido", cleaningRatio: 0.4, priceHonesty: 1.8 }),
    ];
    expect(keep(rows, { cleaningRatioMax: 0.25 })).toEqual(["honesto"]);
    expect(keep(rows, { priceHonestyMax: 1.3 })).toEqual(["honesto"]);
  });

  it("anúncio ainda não cotado não é descartado por filtro de preço real", () => {
    // Punir quem não foi cotado ainda esconderia justamente o que falta cotar.
    const naoCotado = row({ externalId: "pendente", cleaningRatio: null });
    expect(keep([naoCotado], { cleaningRatioMax: 0.1 })).toEqual(["pendente"]);
  });
});

describe("avaliações", () => {
  it("combina sub-notas, volume e recência de uma vez", () => {
    const rows = [
      row({ externalId: "bom" }),
      row({ externalId: "sujo", ratingCleanliness: 4.1 }),
      row({ externalId: "poucas", reviewCount: 3 }),
      row({
        externalId: "morto",
        lastReviewAt: new Date(Date.now() - 500 * 86_400_000).toISOString().slice(0, 10),
      }),
    ];
    expect(
      keep(rows, {
        ratingCleanlinessMin: 4.8,
        ratingLocationMin: 4.7,
        reviewCountMin: 30,
        lastReviewWithinDays: 90,
      }),
    ).toEqual(["bom"]);
  });

  it("inclui ou exclui anúncio novo explicitamente", () => {
    const rows = [row({ externalId: "novo", reviewCount: 0 }), row({ externalId: "velho" })];
    expect(keep(rows, { onlyWithoutReviews: true })).toEqual(["novo"]);
    expect(keep(rows, { onlyWithoutReviews: false })).toEqual(["velho"]);
    expect(keep(rows, {})).toEqual(["novo", "velho"]);
  });
});

describe("texto das avaliações", () => {
  const comBarulho = row({
    externalId: "barulhento",
    reviews: [{ comment: "Tinha muito barulho de obra na rua", createdAt: null, rating: 3 }],
  });
  const silencioso = row({
    externalId: "silencioso",
    reviews: [{ comment: "Apartamento impecável e silencioso", createdAt: null, rating: 5 }],
  });

  it("exclui quem menciona os termos", () => {
    expect(keep([comBarulho, silencioso], { reviewsExcludeTerms: ["barulho", "mofo"] })).toEqual([
      "silencioso",
    ]);
  });

  it("inclui só quem menciona os termos", () => {
    expect(keep([comBarulho, silencioso], { reviewsIncludeTerms: ["silencioso"] })).toEqual([
      "silencioso",
    ]);
  });

  it("casa termo sem acento com texto acentuado", () => {
    const comInfiltracao = row({
      externalId: "umido",
      reviews: [{ comment: "Havia infiltração no teto", createdAt: null, rating: 2 }],
    });
    expect(keep([comInfiltracao], { reviewsExcludeTerms: ["infiltracao"] })).toEqual([]);
  });

  it("anúncio sem avaliações carregadas sobrevive à exclusão", () => {
    expect(keep([row({ externalId: "sem" })], { reviewsExcludeTerms: ["barulho"] })).toEqual([
      "sem",
    ]);
  });
});

describe("busca por palavra-chave", () => {
  const comSauna = row({
    externalId: "sauna",
    title: "Chalé na serra",
    description: "Tem sauna a vapor e lareira na sala.",
    amenityLabels: ["Sauna", "Lareira"],
  });
  const comQuadra = row({
    externalId: "quadra",
    title: "Casa com quadra de tênis",
    description: "Área de lazer completa.",
    amenityLabels: ["Quadra de tênis", "Piscina"],
  });
  const semNada = row({
    externalId: "simples",
    title: "Apartamento no centro",
    description: "Perto do metrô.",
    amenityLabels: ["Wi-Fi"],
  });

  it("acha o que o vocabulário canônico não cobre", () => {
    // "sauna" e "quadra de tênis" não são chaves canônicas — é exatamente
    // por isso que a busca livre existe.
    expect(matchesKeyword(comSauna, "sauna")).toBe(true);
    expect(matchesKeyword(comQuadra, "quadra de tênis")).toBe(true);
    expect(matchesKeyword(semNada, "sauna")).toBe(false);
  });

  it("ignora acento e caixa", () => {
    expect(matchesKeyword(comQuadra, "QUADRA DE TENIS")).toBe(true);
    expect(matchesKeyword(comSauna, "Lareira")).toBe(true);
  });

  it("procura no título, na descrição e nos rótulos de amenidade", () => {
    expect(matchesKeyword(comQuadra, "casa com quadra")).toBe(true);
    expect(matchesKeyword(comSauna, "vapor")).toBe(true);
    expect(matchesKeyword(comQuadra, "piscina")).toBe(true);
  });

  it("também alcança os rótulos das amenidades canônicas", () => {
    const comAr = row({
      externalId: "ar",
      title: "Sem menção no título",
      description: "Nada aqui.",
      amenityLabels: [],
      amenities: ["air_conditioning"],
    });
    expect(matchesKeyword(comAr, "ar-condicionado")).toBe(true);
  });

  it("modo 'todas' exige todas as palavras", () => {
    const rows = [comSauna, comQuadra, semNada];
    expect(keep(rows, { keywords: ["piscina", "quadra"], keywordsMode: "all" })).toEqual([
      "quadra",
    ]);
  });

  it("modo 'qualquer' basta uma", () => {
    const rows = [comSauna, comQuadra, semNada];
    expect(keep(rows, { keywords: ["sauna", "quadra"], keywordsMode: "any" })).toEqual([
      "sauna",
      "quadra",
    ]);
  });

  it("o padrão é exigir todas", () => {
    const rows = [comSauna, comQuadra];
    expect(keep(rows, { keywords: ["sauna", "quadra"] })).toEqual([]);
  });

  it("anúncio sem conteúdo carregado não é reprovado por ausência", () => {
    // Antes do passo 2 só existe o título: um anúncio com sauna cujo título
    // não menciona sauna não pode ser descartado por isso.
    const naoCarregado = row({
      externalId: "pendente",
      title: "Apartamento",
      description: null,
      houseRules: null,
      amenityLabels: [],
      amenities: [],
    });
    expect(hasContent(naoCarregado)).toBe(false);
    expect(keep([naoCarregado], { keywords: ["sauna"] })).toEqual(["pendente"]);
  });

  it("mas é reprovado depois que o conteúdo chega e nada casa", () => {
    const carregado = row({
      externalId: "verificado",
      title: "Apartamento",
      description: "Sem área de lazer.",
      amenityLabels: ["Wi-Fi"],
    });
    expect(hasContent(carregado)).toBe(true);
    expect(keep([carregado], { keywords: ["sauna"] })).toEqual([]);
  });

  it("reporta quais palavras casaram, para a UI explicar o porquê", () => {
    expect(matchedKeywords(comQuadra, ["piscina", "sauna", "quadra"])).toEqual([
      "piscina",
      "quadra",
    ]);
  });

  it("palavra-chave que zera o resultado aparece no diagnóstico", () => {
    const outcome = applyFilter([comSauna, comQuadra], { keywords: ["heliponto"] });
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.culprits.map((c) => c.key)).toEqual(["keywords"]);
  });
});

describe("amenidades com lógica booleana", () => {
  const expr = {
    op: "and" as const,
    children: [
      { op: "has" as const, amenity: "air_conditioning" },
      {
        op: "or" as const,
        children: [
          { op: "has" as const, amenity: "washer" },
          { op: "has" as const, amenity: "dryer" },
        ],
      },
      { op: "not" as const, child: { op: "has" as const, amenity: "shared_bathroom" } },
    ],
  };

  it("avalia ar_condicionado AND (lavadora OR secadora) AND NOT banheiro_compartilhado", () => {
    expect(evaluateAmenityExpr(expr, ["air_conditioning", "dryer"])).toBe(true);
    expect(evaluateAmenityExpr(expr, ["air_conditioning", "washer"])).toBe(true);
    expect(evaluateAmenityExpr(expr, ["washer"])).toBe(false);
    expect(
      evaluateAmenityExpr(expr, ["air_conditioning", "washer", "shared_bathroom"]),
    ).toBe(false);
  });

  it("filtra as linhas com a mesma expressão", () => {
    const rows = [
      row({ externalId: "passa", amenities: ["air_conditioning", "dryer"] }),
      row({ externalId: "falha", amenities: ["air_conditioning", "shared_bathroom", "washer"] }),
    ];
    expect(keep(rows, { amenities: expr })).toEqual(["passa"]);
  });

  it("aninhamento profundo", () => {
    const profundo = {
      op: "or" as const,
      children: [
        { op: "and" as const, children: [
          { op: "has" as const, amenity: "pool" },
          { op: "has" as const, amenity: "gym" },
        ] },
        { op: "not" as const, child: { op: "has" as const, amenity: "tv" } },
      ],
    };
    expect(evaluateAmenityExpr(profundo, ["pool", "gym"])).toBe(true);
    expect(evaluateAmenityExpr(profundo, ["wifi"])).toBe(true);
    expect(evaluateAmenityExpr(profundo, ["tv"])).toBe(false);
  });

  it("o schema recusa amenidade fora do vocabulário", () => {
    expect(
      filterDefinitionSchema.safeParse({
        amenities: { op: "has", amenity: "vaso_de_samambaia" },
      }).success,
    ).toBe(false);
  });
});

describe("estrutura e anfitrião", () => {
  it("exclui hotel e quarto compartilhado", () => {
    const rows = [
      row({ externalId: "inteiro", roomType: "entire_home" }),
      row({ externalId: "hotel", roomType: "hotel_room" }),
      row({ externalId: "desconhecido", roomType: null }),
    ];
    // Tipo desconhecido não é descartado: a origem simplesmente não informou.
    expect(keep(rows, { excludeRoomTypes: ["hotel_room", "shared_room"] })).toEqual([
      "inteiro",
      "desconhecido",
    ]);
  });

  it("razão camas/hóspedes expõe o anúncio apertado", () => {
    const rows = [
      row({ externalId: "folgado", bedsPerGuest: 0.75 }),
      row({ externalId: "apertado", bedsPerGuest: 0.33 }),
    ];
    expect(keep(rows, { bedsPerGuestMin: 0.5 })).toEqual(["folgado"]);
  });

  it("teto de anúncios exclui gestoras de portfólio", () => {
    const rows = [
      row({ externalId: "pessoal", hostListingCount: 2 }),
      row({ externalId: "gestora", hostListingCount: 40 }),
    ];
    expect(keep(rows, { hostListingCountMax: 5 })).toEqual(["pessoal"]);
  });

  it("banheiro privativo checa flag e amenidade", () => {
    const rows = [
      row({ externalId: "privativo" }),
      row({ externalId: "flag", isSharedBathroom: true }),
      row({ externalId: "amenidade", amenities: ["shared_bathroom"] }),
    ];
    expect(keep(rows, { requirePrivateBathroom: true })).toEqual(["privativo"]);
  });
});

describe("políticas", () => {
  it("escala ordenada de cancelamento", () => {
    expect(allowedPolicies("moderate")).toEqual(["flexible", "moderate"]);
    expect(allowedPolicies("super_strict")).toHaveLength(4);
  });

  it("não descarta política desconhecida", () => {
    const rows = [
      row({ externalId: "moderada", cancellationPolicy: "moderate" }),
      row({ externalId: "rigorosa", cancellationPolicy: "strict" }),
      row({ externalId: "desconhecida", cancellationPolicy: null }),
    ];
    expect(keep(rows, { cancellationAtMost: "moderate" })).toEqual([
      "moderada",
      "desconhecida",
    ]);
  });
});

describe("geografia", () => {
  it("haversine bate com a distância conhecida", () => {
    // Lisboa → Porto, ~274 km.
    const metros = haversineMeters(38.7223, -9.1393, 41.1579, -8.6291);
    expect(metros).toBeGreaterThan(270_000);
    expect(metros).toBeLessThan(280_000);
  });

  it("AND exige estar perto de todas; OR basta uma", () => {
    const perto = row({ externalId: "perto" });
    attachAnchorLimits(perto, new Map([["a", 1200], ["b", 1200]]));
    perto.anchorDistances = [
      { anchorId: "a", label: "Escritório", meters: 900 },
      { anchorId: "b", label: "Escola", meters: 1000 },
    ];

    const meio = row({ externalId: "meio" });
    attachAnchorLimits(meio, new Map([["a", 1200], ["b", 1200]]));
    meio.anchorDistances = [
      { anchorId: "a", label: "Escritório", meters: 900 },
      { anchorId: "b", label: "Escola", meters: 5000 },
    ];

    const rows = [perto, meio];
    expect(keep(rows, { anchors: { mode: "and", toleranceM: 200 } })).toEqual(["perto"]);
    expect(keep(rows, { anchors: { mode: "or", toleranceM: 200 } })).toEqual(["perto", "meio"]);
  });

  it("a margem de tolerância cobre a ofuscação do pino", () => {
    const limite = row({ externalId: "limite" });
    attachAnchorLimits(limite, new Map([["a", 1200]]));
    limite.anchorDistances = [{ anchorId: "a", label: "Escritório", meters: 1350 }];

    // 1350 m contra um raio de 1200 m: só passa por causa dos 200 m de margem.
    expect(keep([limite], { anchors: { mode: "and", toleranceM: 200 } })).toEqual(["limite"]);
    expect(keep([limite], { anchors: { mode: "and", toleranceM: 0 } })).toEqual([]);
  });

  it("exclusão por raio afasta de área ruidosa", () => {
    const rows = [
      row({ externalId: "longe", lat: 38.75, lng: -9.2 }),
      row({ externalId: "colado", lat: 38.7101, lng: -9.1401 }),
    ];
    expect(
      keep(rows, { excludeRadius: [{ lat: 38.71, lng: -9.14, minDistanceM: 400 }] }),
    ).toEqual(["longe"]);
  });

  it("polígono contém o ponto de dentro e rejeita o de fora", () => {
    const poligono = [
      { lat: 38.6, lng: -9.3 },
      { lat: 38.8, lng: -9.3 },
      { lat: 38.8, lng: -9.0 },
      { lat: 38.6, lng: -9.0 },
    ];
    expect(pointInPolygon(38.72, -9.14, poligono)).toBe(true);
    expect(pointInPolygon(41.15, -8.62, poligono)).toBe(false);
  });
});

describe("triagem", () => {
  it("exclui descartados, mostra favoritos, oculta vistos", () => {
    const rows = [
      row({ externalId: "novo" }),
      row({ externalId: "fav", verdict: "shortlist" }),
      row({ externalId: "nao", verdict: "rejected" }),
      row({ externalId: "visto", verdict: "seen" }),
    ];
    expect(keep(rows, { excludeRejected: true })).toEqual(["novo", "fav", "visto"]);
    expect(keep(rows, { onlyShortlist: true })).toEqual(["fav"]);
    expect(keep(rows, { hideSeen: true })).toEqual(["novo"]);
  });
});

describe("diagnóstico de estado vazio", () => {
  it("aponta o filtro que zerou sozinho", () => {
    const rows = [row({ externalId: "a", ratingOverall: 4.5 })];
    const outcome = applyFilter(rows, { ratingOverallMin: 4.9, reviewCountMin: 10 });

    expect(outcome.rows).toHaveLength(0);
    expect(outcome.culprits.map((c) => c.key)).toEqual(["ratingOverallMin"]);
    expect(outcome.base).toBe(1);
  });

  it("quando é a combinação, ninguém zera sozinho", () => {
    const rows = [
      row({ externalId: "a", ratingOverall: 4.9, reviewCount: 5 }),
      row({ externalId: "b", ratingOverall: 4.1, reviewCount: 500 }),
    ];
    const outcome = applyFilter(rows, { ratingOverallMin: 4.8, reviewCountMin: 100 });

    expect(outcome.rows).toHaveLength(0);
    expect(outcome.culprits).toHaveLength(0);
    expect(outcome.perFilter.every((entry) => entry.survivors === 1)).toBe(true);
  });

  it("sem filtro, nada é removido", () => {
    const rows = [row({ externalId: "a" }), row({ externalId: "b" })];
    const outcome = applyFilter(rows, {});
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.perFilter).toHaveLength(0);
  });
});

describe("o critério de aceite de §14", () => {
  it("limpeza ≥ 4,8 E localização ≥ 4,7 E ≥ 30 avaliações E última nos 90 dias", () => {
    const filter = filterDefinitionSchema.parse({
      ratingCleanlinessMin: 4.8,
      ratingLocationMin: 4.7,
      reviewCountMin: 30,
      lastReviewWithinDays: 90,
    });
    const outcome = applyFilter([row({ externalId: "ok" })], filter);
    expect(outcome.perFilter).toHaveLength(4);
    expect(outcome.rows).toHaveLength(1);
  });
});
