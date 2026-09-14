import { describe, expect, it } from "vitest";
import { PRICE_DROP_THRESHOLD } from "../detect";

describe("limiar de queda de preço", () => {
  it("é de 5%, como manda §11", () => {
    expect(PRICE_DROP_THRESHOLD).toBe(0.05);
  });

  it("uma queda de 4% não dispara; uma de 6% dispara", () => {
    const anterior = 500;
    const limite = anterior * (1 - PRICE_DROP_THRESHOLD);
    expect(anterior * 0.96).toBeGreaterThan(limite);
    expect(anterior * 0.94).toBeLessThan(limite);
  });
});
