import { describe, expect, it } from "vitest";
import { buildCountQuery } from "@/lib/filters/build";

/**
 * O seletor de candidatos do enriquecimento reescreve a consulta de contagem
 * para reaproveitar exatamente os mesmos predicados. Se o formato do SELECT
 * mudar, a substituição silenciosamente para de funcionar — por isso o
 * contrato é fixado aqui.
 */
describe("contrato entre a contagem e o seletor de candidatos", () => {
  it("a consulta de contagem começa com o SELECT que o enriquecimento substitui", () => {
    const { text } = buildCountQuery("11111111-1111-4111-8111-111111111111", {
      ratingOverallMin: 4.5,
    });
    expect(text).toContain("select count(*)::int as total");
  });

  it("a substituição produz SQL com as colunas de controle de cache", () => {
    const { text } = buildCountQuery("11111111-1111-4111-8111-111111111111", {});
    const selection = text.replace(
      "select count(*)::int as total",
      `select
      l.id,
      l.external_id,
      l.detail_fetched_at,
      l.reviews_fetched_at,
      (select max(q.captured_at) from listing_snapshots q
        where q.listing_id = l.id and q.source = 'quote') as last_quote_at`,
    );

    expect(selection).not.toContain("count(*)::int as total");
    expect(selection).toContain("l.detail_fetched_at");
    expect(selection).toContain("q.source = 'quote'");
    // O join e os predicados continuam intactos.
    expect(selection).toContain("join ultimo_snapshot s on s.listing_id = l.id");
  });
});
