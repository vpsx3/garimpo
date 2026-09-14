import { limitedFetch, REALISTIC_USER_AGENT } from "@/lib/providers/http";
import { ProviderStaleError } from "@/lib/providers/types";

/**
 * Extração em runtime da chave pública da API e dos hashes das operações
 * persistidas do GraphQL da origem.
 *
 * Nada disso é hardcodado: a chave é pública mas rotaciona, e os
 * `sha256Hash` das persisted queries mudam a cada deploy deles. A regra é
 * simples — se a extração falhar, o adapter é considerado obsoleto e lança
 * `ProviderStaleError` para que o sistema caia para a Apify.
 */

const HOMEPAGE = "https://www.airbnb.com.br/";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LIMITER = "direct";

export type DirectBootstrap = {
  apiKey: string;
  /** operationName -> sha256Hash, quando encontrado no bundle. */
  operationHashes: Record<string, string>;
  fetchedAt: number;
};

let cache: DirectBootstrap | undefined;
let inFlight: Promise<DirectBootstrap> | undefined;

/** `api_config":{"key":"<32 hex>"` e variantes usadas no bundle/HTML. */
const API_KEY_PATTERNS = [
  /"api_config"\s*:\s*\{\s*"key"\s*:\s*"([a-z0-9]{32,})"/i,
  /"baseUrl":"\/api","key":"([a-z0-9]{32,})"/i,
  /X-Airbnb-API-Key["']?\s*[:=]\s*["']([a-z0-9]{32,})["']/i,
  /apiConfig["']?\s*:\s*\{[^}]*?key["']?\s*:\s*["']([a-z0-9]{32,})["']/i,
];

/** `{"name":"StaysSearch","version":"...","sha256Hash":"<64 hex>"}` */
const OPERATION_PATTERN =
  /["']([A-Za-z][A-Za-z0-9_]{3,60})["']\s*,\s*["']?(?:sha256Hash)?["']?\s*[:,]\s*["']([a-f0-9]{64})["']/g;
const NAMED_OPERATION_PATTERN =
  /"operationName"\s*:\s*"([A-Za-z][A-Za-z0-9_]{3,60})"[^}]{0,200}?"sha256Hash"\s*:\s*"([a-f0-9]{64})"/g;

export async function getBootstrap(force = false): Promise<DirectBootstrap> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  if (!inFlight) {
    inFlight = loadBootstrap()
      .then((value) => {
        cache = value;
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
}

export function invalidateBootstrap(): void {
  cache = undefined;
}

async function loadBootstrap(): Promise<DirectBootstrap> {
  const html = await fetchText(HOMEPAGE);
  const apiKey = extractApiKey(html);

  if (!apiKey) {
    throw new ProviderStaleError(
      "Não foi possível extrair a X-Airbnb-Api-Key da página inicial. " +
        "O adapter `direct` está obsoleto.",
    );
  }

  const operationHashes = extractOperationHashes(html);

  // Os hashes costumam viver nos bundles, não no HTML. Buscamos os poucos
  // scripts mais promissores em vez de varrer tudo: o custo de rede importa.
  if (Object.keys(operationHashes).length === 0) {
    for (const scriptUrl of pickScriptUrls(html).slice(0, 3)) {
      try {
        const script = await fetchText(scriptUrl);
        Object.assign(operationHashes, extractOperationHashes(script));
        if (Object.keys(operationHashes).length > 0) break;
      } catch {
        // Um bundle inacessível não invalida o bootstrap: a chave já basta
        // para as chamadas que não dependem de persisted query.
      }
    }
  }

  return { apiKey, operationHashes, fetchedAt: Date.now() };
}

async function fetchText(url: string): Promise<string> {
  const response = await limitedFetch(url, {
    limiter: LIMITER,
    headers: {
      "user-agent": REALISTIC_USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 25_000,
  });
  if (!response.ok) {
    throw new ProviderStaleError(
      `Página inicial da origem respondeu ${response.status}.`,
    );
  }
  return response.text();
}

export function extractApiKey(source: string): string | null {
  for (const pattern of API_KEY_PATTERNS) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractOperationHashes(source: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const pattern of [NAMED_OPERATION_PATTERN, OPERATION_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const [, name, hash] = match;
      if (name && hash && !hashes[name]) hashes[name] = hash;
    }
  }
  return hashes;
}

export function pickScriptUrls(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const src = match[1];
    if (!src) continue;
    const absolute = src.startsWith("http")
      ? src
      : new URL(src, HOMEPAGE).toString();
    // Os bundles com as persisted queries são os de rota/aplicação.
    if (/(main|app|common|web|route|api)/i.test(absolute)) urls.add(absolute);
  }
  return [...urls];
}
