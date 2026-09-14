/**
 * Acesso centralizado a variáveis de ambiente.
 *
 * Nada aqui é validado no momento do import: o build da Vercel roda sem as
 * variáveis de runtime e um `throw` no topo do módulo quebraria a compilação.
 * A validação acontece no ponto de uso, via `requireEnv`.
 */

export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Configure-a no projeto da Vercel ou em .env.local.`,
    );
  }
  return value;
}

export function envFlag(name: string, fallback = false): boolean {
  const value = env(name);
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function envNumber(name: string, fallback: number): number {
  const value = env(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type ProviderName = "apify" | "direct";

export function activeProviderName(): ProviderName {
  return env("SEARCH_PROVIDER") === "apify" ? "apify" : "direct";
}
