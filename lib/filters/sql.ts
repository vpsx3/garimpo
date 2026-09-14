/**
 * Acumulador de SQL parametrizado.
 *
 * Valores **nunca** entram no texto: cada um vira um placeholder `$n` e é
 * enviado ao Postgres como parâmetro. O texto é montado só a partir de
 * literais do código — nomes de coluna e operadores vêm de listas fixas, nunca
 * de entrada do usuário.
 *
 * O resultado é `{ text, params }` em vez de um fragmento do driver, e isso é
 * deliberado: assim o builder inteiro é testável sem banco.
 */
export class SqlBuilder {
  private readonly values: unknown[] = [];

  /** Registra o valor e devolve o placeholder que o representa. */
  param(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  get params(): unknown[] {
    return [...this.values];
  }

  get size(): number {
    return this.values.length;
  }
}

export type Predicate = {
  /** Chave estável do filtro, usada no estado vazio da UI. */
  key: string;
  /** Rótulo legível, para dizer *qual* filtro zerou o resultado. */
  label: string;
  sql: string;
};

export function joinAnd(predicates: Predicate[]): string {
  if (predicates.length === 0) return "true";
  return predicates.map((predicate) => `(${predicate.sql})`).join("\n    and ");
}
