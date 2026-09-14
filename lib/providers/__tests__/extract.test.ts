import { describe, expect, it } from "vitest";
import {
  asBoolean,
  asDate,
  asNumber,
  asPercent,
  asRating,
  asStringArray,
  firstDefined,
} from "../extract";

describe("asNumber", () => {
  it("lê o formato brasileiro", () => {
    expect(asNumber("R$ 1.234,56")).toBe(1234.56);
    expect(asNumber("R$ 412,90")).toBe(412.9);
  });

  it("lê o formato americano", () => {
    expect(asNumber("$1,234.56")).toBe(1234.56);
  });

  it("trata separadores de milhar sem decimais", () => {
    expect(asNumber("R$ 2.600")).toBe(2600);
    expect(asNumber("2,600")).toBe(2600);
  });

  it("preserva sinal negativo de descontos", () => {
    expect(asNumber("-R$ 130,00")).toBe(-130);
  });

  it("devolve null para lixo", () => {
    expect(asNumber("sob consulta")).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(asNumber(Number.NaN)).toBeNull();
  });
});

describe("asRating", () => {
  it("mantém a escala 0–5", () => {
    expect(asRating(4.87)).toBe(4.87);
  });

  it("converte escala 0–100", () => {
    expect(asRating(96)).toBe(4.8);
  });

  it("converte escala 0–10", () => {
    expect(asRating(9)).toBe(4.5);
  });
});

describe("asDate", () => {
  it("aceita ISO", () => {
    expect(asDate("2025-03-14T00:00:00Z")).toBe("2025-03-14");
  });

  it("extrai o ano de datas por extenso", () => {
    expect(asDate("janeiro de 2025")).toBe("2025-01-01");
  });

  it("aceita timestamps em segundos e em milissegundos", () => {
    expect(asDate(1_700_000_000)).toBe("2023-11-14");
    expect(asDate(1_700_000_000_000)).toBe("2023-11-14");
  });
});

describe("asStringArray", () => {
  it("achata objetos rotulados", () => {
    expect(asStringArray(["Wi-Fi", { title: "Máquina de lavar" }])).toEqual([
      "Wi-Fi",
      "Máquina de lavar",
    ]);
  });

  it("devolve null quando não é lista", () => {
    expect(asStringArray("Wi-Fi")).toBeNull();
  });
});

describe("firstDefined", () => {
  it("pega o primeiro caminho existente", () => {
    const source = { a: null, b: { c: 7 } };
    expect(firstDefined(source, ["a", "b.c", "d"])).toBe(7);
  });

  it("ignora string vazia", () => {
    expect(firstDefined({ a: "", b: "x" }, ["a", "b"])).toBe("x");
  });
});

describe("asBoolean / asPercent", () => {
  it("entende rótulos em português", () => {
    expect(asBoolean("sim")).toBe(true);
    expect(asBoolean("não")).toBe(false);
  });

  it("normaliza percentuais", () => {
    expect(asPercent("100%")).toBe(100);
    expect(asPercent(0.95)).toBe(95);
    expect(asPercent(95)).toBe(95);
  });
});
