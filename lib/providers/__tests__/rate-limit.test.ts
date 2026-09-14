import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../rate-limit";
import { ProviderTransientError } from "../types";

describe("withRetry", () => {
  it("repete falha transitória e devolve o sucesso", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new ProviderTransientError("429", 429);
        return "ok";
      },
      { baseDelayMs: 1, shouldRetry: (e) => e instanceof ProviderTransientError },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("não repete o que não é transitório", async () => {
    const task = vi.fn(async () => {
      throw new Error("erro de lógica");
    });
    await expect(
      withRetry(task, {
        baseDelayMs: 1,
        shouldRetry: (e) => e instanceof ProviderTransientError,
      }),
    ).rejects.toThrow("erro de lógica");
    expect(task).toHaveBeenCalledOnce();
  });

  it("desiste depois do número de tentativas", async () => {
    const task = vi.fn(async () => {
      throw new ProviderTransientError("503", 503);
    });
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(ProviderTransientError);
    expect(task).toHaveBeenCalledTimes(3);
  });
});
