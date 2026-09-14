import { limitedFetch } from "@/lib/providers/http";
import { ProviderStaleError } from "@/lib/providers/types";

/**
 * Leitura do estado embutido nas páginas do Airbnb.
 *
 * Esta é a virada de estratégia do adapter `direct`: em vez de falar com o
 * GraphQL interno — que exige uma `sha256Hash` de operação persistida que
 * rotaciona e não aparece em lugar nenhum fácil de extrair — pedimos a mesma
 * página que o navegador pede e lemos o JSON que ela já carrega.
 *
 * A resposta do GraphQL vem inteira dentro de `data-deferred-state-0`. É o
 * mesmo dado, sem chave de API, sem hash e sem persisted query: três pontos de
 * quebra a menos.
 */

const LIMITER = "direct";

const DEFERRED_STATE =
  /<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/;

export async function fetchDeferredState(url: string): Promise<unknown> {
  const response = await limitedFetch(url, {
    limiter: LIMITER,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "upgrade-insecure-requests": "1",
    },
    timeoutMs: 45_000,
    attempts: 2,
  });

  if (!response.ok) {
    throw new ProviderStaleError(
      `A origem respondeu ${response.status} para ${url}.`,
    );
  }

  const html = await response.text();
  const match = html.match(DEFERRED_STATE);

  if (!match?.[1]) {
    // Sem o bloco de estado, a página mudou de forma ou veio um desafio
    // anti-bot. Nos dois casos o adapter está obsoleto.
    throw new ProviderStaleError(
      "A página não trouxe o bloco data-deferred-state-0; a forma mudou ou " +
        "a requisição foi barrada.",
    );
  }

  try {
    return JSON.parse(decodeEntities(match[1]));
  } catch (error) {
    throw new ProviderStaleError(
      `O bloco de estado não é JSON válido: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** O HTML escapa `<` e `&` dentro do script para não fechar a tag. */
function decodeEntities(value: string): string {
  return value
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&");
}

/**
 * Localiza a resposta do GraphQL dentro do estado. O caminho conhecido é
 * `niobeClientData[n][1]`, mas procuramos por formato para não depender dele.
 */
export function findGraphqlPayloads(state: unknown): unknown[] {
  const payloads: unknown[] = [];

  const visit = (node: unknown, depth = 0) => {
    if (depth > 8 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.data && typeof record.data === "object") payloads.push(record);
    for (const value of Object.values(record)) visit(value, depth + 1);
  };

  visit(state);
  return payloads;
}

/** Cursor de paginação: base64 de `{section_offset, items_offset, version}`. */
export function pageCursor(itemsOffset: number): string {
  return Buffer.from(
    JSON.stringify({ section_offset: 0, items_offset: itemsOffset, version: 1 }),
    "utf8",
  ).toString("base64");
}

/** "Lisboa, Portugal" → "Lisboa--Portugal", como a origem escreve na URL. */
export function locationSlug(query: string): string {
  return encodeURIComponent(
    query
      .trim()
      .replace(/\s*,\s*/g, "--")
      .replace(/\s+/g, "-"),
  ).replace(/%2D%2D/gi, "--");
}
