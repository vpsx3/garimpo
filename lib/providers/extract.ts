/**
 * Leitura defensiva de payloads instáveis.
 *
 * Nenhum campo da origem é tratado como garantido: cada valor é buscado por
 * uma lista de caminhos possíveis e coagido ao tipo esperado. Quando nada
 * casa, o resultado é `null` e o pipeline segue — o payload bruto já está
 * persistido, então nada se perde.
 */

export type Path = string; // "pricing.rate.amount"

export function readPath(source: unknown, path: Path): unknown {
  let current = source;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function firstDefined(source: unknown, paths: Path[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return null;
}

/**
 * Números chegam como "R$ 1.234,56", "$1,234.56", "1234.56" ou já como number.
 * Distinguir separador decimal de milhar é o ponto delicado: o último
 * separador presente manda, e apenas quando sobram 1 ou 2 dígitos depois dele.
 */
export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;

  const separators = cleaned.match(/[.,]/g) ?? [];
  let normalized: string;

  if (separators.length === 0) {
    normalized = cleaned;
  } else {
    const decimalAt = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
    const decimals = cleaned.length - decimalAt - 1;
    const mixedSeparators = cleaned.includes(",") && cleaned.includes(".");

    // Um único separador seguido de exatamente três dígitos é milhar
    // ("R$ 2.600", "2,600"). Qualquer outra contagem é decimal — é o que
    // distingue "38.7223" (coordenada) de "2.600" (preço).
    const isThousandsOnly =
      !mixedSeparators && decimals === 3 && separators.length >= 1;

    if (isThousandsOnly) {
      normalized = cleaned.replace(/[.,]/g, "");
    } else {
      normalized =
        cleaned.slice(0, decimalAt).replace(/[.,]/g, "") +
        "." +
        cleaned.slice(decimalAt + 1);
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Coordenadas nunca têm separador de milhar, então o palpite de `asNumber`
 * atrapalha: "38.7223" precisa continuar sendo 38,7223 e não 387223.
 */
export function asCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function asInt(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "sim", "1"].includes(normalized)) return true;
    if (["false", "no", "não", "nao", "0"].includes(normalized)) return false;
  }
  return null;
}

/** Aceita ISO, "2024-03-05", "March 2024", timestamps em ms e em segundos. */
export function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value > 1e11 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return toIsoDate(direct);
  // "março de 2019" / "March 2019" não são parseáveis: só o ano é aproveitável.
  const yearOnly = trimmed.match(/\b(19|20)\d{2}\b/);
  return yearOnly ? `${yearOnly[0]}-01-01` : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return asString(record.title ?? record.name ?? record.label ?? record.value);
      }
      return null;
    })
    .filter((item): item is string => Boolean(item && item.trim()));
  return items.length ? items : [];
}

/** Percentuais chegam como 100, "100%" ou 1.0. */
export function asPercent(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  if (parsed > 0 && parsed <= 1 && !Number.isInteger(parsed)) {
    return Math.round(parsed * 100);
  }
  return Math.round(parsed);
}

/**
 * Notas às vezes vêm em escala 0–100 ou 0–10. O produto trabalha em 0–5.
 */
export function asRating(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 0) return null;
  if (parsed > 10) return Math.round((parsed / 20) * 100) / 100;
  if (parsed > 5) return Math.round((parsed / 2) * 100) / 100;
  return Math.round(parsed * 100) / 100;
}
