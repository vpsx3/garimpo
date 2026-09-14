import { ProviderTransientError } from "./types";
import { limiterFor, withRetry } from "./rate-limit";

/**
 * User-Agent realista. A origem rejeita clientes que se anunciam como bots,
 * e um UA vazio é o jeito mais rápido de coletar um 403.
 */
export const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type FetchOptions = RequestInit & {
  /** Nome do limitador: chamadas com o mesmo nome compartilham a fila. */
  limiter: string;
  timeoutMs?: number;
  attempts?: number;
};

export async function limitedFetch(
  url: string,
  { limiter, timeoutMs = 30_000, attempts = 4, ...init }: FetchOptions,
): Promise<Response> {
  const queue = limiterFor(limiter);

  return withRetry(
    () =>
      queue.schedule(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
              "user-agent": REALISTIC_USER_AGENT,
              "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
              ...(init.headers ?? {}),
            },
          });
          if (response.status === 429 || response.status >= 500) {
            throw new ProviderTransientError(
              `${url} respondeu ${response.status}`,
              response.status,
            );
          }
          return response;
        } catch (error) {
          if (error instanceof ProviderTransientError) throw error;
          if (error instanceof Error && error.name === "AbortError") {
            throw new ProviderTransientError(`${url} excedeu ${timeoutMs}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }),
    {
      attempts,
      shouldRetry: (error) => error instanceof ProviderTransientError,
    },
  );
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions,
): Promise<T> {
  const response = await limitedFetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProviderTransientError(
      `${url} respondeu ${response.status}: ${body.slice(0, 300)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}
