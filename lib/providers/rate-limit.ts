import { envNumber } from "@/lib/env";

/**
 * Limitador global de chamadas à origem.
 *
 * §12 da spec: nenhuma chamada é paralelizada acima do teto configurado, nem
 * que o pipeline fique mais lento. Bloqueio de IP é o cenário de falha
 * realista; a lentidão é o preço de não chegar lá.
 *
 * A fila é por processo. Numa função serverless isso já basta: cada instância
 * roda uma ingestão por vez, e o cron nunca dispara duas em paralelo.
 */
class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCallAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();
    });
    // A fila avança mesmo se a tarefa falhar.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run.then(task);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const limiters = new Map<string, RateLimiter>();

export function limiterFor(name: string): RateLimiter {
  const existing = limiters.get(name);
  if (existing) return existing;
  const rps = Math.max(0.05, envNumber("PROVIDER_MAX_RPS", 1));
  const limiter = new RateLimiter(Math.ceil(1000 / rps));
  limiters.set(name, limiter);
  return limiter;
}

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  /** Decide se vale repetir. Por padrão repete só erro transitório. */
  shouldRetry?: (error: unknown) => boolean;
};

/** Backoff exponencial com jitter. */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !shouldRetry(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      await sleep(delay + jitter);
    }
  }
  throw lastError;
}
