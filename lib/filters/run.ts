import { getSql } from "@/lib/db/client";
import {
  buildCountQuery,
  buildDiagnosticQuery,
  buildFilterQuery,
  type BuildOptions,
} from "./build";
import type { FilterDefinition } from "./types";

/**
 * Execução das consultas do query builder.
 *
 * `sql.unsafe(text, params)` recebe o texto montado a partir de literais do
 * código e os valores como parâmetros de protocolo — nenhum valor é
 * interpolado no texto.
 */

export type ResultRow = Record<string, unknown> & {
  id: string;
  effective_nightly: number | null;
  gross_nightly: number | null;
};

export async function runFilterQuery(options: BuildOptions): Promise<ResultRow[]> {
  const sql = await getSql();
  const { text, params } = buildFilterQuery(options);
  return sql.unsafe<ResultRow[]>(text, params as never[]);
}

export async function countMatches(
  searchId: string,
  filter: FilterDefinition,
): Promise<number> {
  const sql = await getSql();
  const { text, params } = buildCountQuery(searchId, filter);
  const [row] = await sql.unsafe<{ total: number }[]>(text, params as never[]);
  return row?.total ?? 0;
}

export type EmptyDiagnosis = {
  base: number;
  /** Quantos anúncios cada filtro sozinho deixaria passar. */
  perFilter: { key: string; label: string; survivors: number }[];
  /** Os filtros que sozinhos já zeram o resultado. */
  culprits: { key: string; label: string }[];
};

/**
 * Responde "qual filtro zerou o resultado", que é o que o estado vazio da UI
 * precisa dizer (§10). Cada predicado é contado isoladamente sobre o conjunto
 * da busca — isolar é justamente o que torna o culpado identificável.
 */
export async function diagnoseEmpty(
  searchId: string,
  filter: FilterDefinition,
): Promise<EmptyDiagnosis> {
  const sql = await getSql();
  const { text, params, predicates } = buildDiagnosticQuery(searchId, filter);
  const [row] = await sql.unsafe<Record<string, number>[]>(text, params as never[]);

  const perFilter = predicates.map((predicate, index) => ({
    key: predicate.key,
    label: predicate.label,
    survivors: row?.[`p${index}`] ?? 0,
  }));

  return {
    base: row?.base ?? 0,
    perFilter,
    culprits: perFilter
      .filter((entry) => entry.survivors === 0)
      .map(({ key, label }) => ({ key, label })),
  };
}
