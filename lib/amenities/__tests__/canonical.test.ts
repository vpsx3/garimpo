import { describe, expect, it } from "vitest";
import { AMENITY_KEYS, canonicalizeAmenities, canonicalizeAmenity } from "../canonical";

describe("canonicalizeAmenity", () => {
  it("junta variantes do mesmo conceito", () => {
    for (const label of [
      "Ar-condicionado",
      "Ar condicionado",
      "Air conditioning",
      "AC",
      "ar-condicionado split",
    ]) {
      expect(canonicalizeAmenity(label)).toBe("air_conditioning");
    }
  });

  it("distingue lavadora de secadora", () => {
    expect(canonicalizeAmenity("Máquina de lavar")).toBe("washer");
    expect(canonicalizeAmenity("Washer")).toBe("washer");
    expect(canonicalizeAmenity("Secadora")).toBe("dryer");
    expect(canonicalizeAmenity("Dryer")).toBe("dryer");
  });

  it("não confunde lava-louças com máquina de lavar roupa", () => {
    expect(canonicalizeAmenity("Lava-louças")).toBe("dishwasher");
    expect(canonicalizeAmenity("Dishwasher")).toBe("dishwasher");
  });

  it("prefere o mais específico: wifi rápido antes de wifi", () => {
    expect(canonicalizeAmenity("Wifi rápido – 200 Mbps")).toBe("wifi_fast");
    expect(canonicalizeAmenity("Wi-Fi")).toBe("wifi");
  });

  it("aceita chave já canônica", () => {
    expect(canonicalizeAmenity("air_conditioning")).toBe("air_conditioning");
  });

  it("descarta rótulo desconhecido em vez de inventar chave", () => {
    expect(canonicalizeAmenity("Vaso de samambaia")).toBeNull();
    expect(canonicalizeAmenity("")).toBeNull();
  });
});

describe("canonicalizeAmenities", () => {
  it("deduplica e ordena", () => {
    expect(
      canonicalizeAmenities(["Ar-condicionado", "AC", "Wi-Fi", "Elevador"]),
    ).toEqual(["air_conditioning", "elevator", "wifi"]);
  });

  it("tolera entrada ausente", () => {
    expect(canonicalizeAmenities(null)).toEqual([]);
    expect(canonicalizeAmenities(undefined)).toEqual([]);
  });

  it("toda chave produzida pertence ao vocabulário", () => {
    const keys = canonicalizeAmenities([
      "Piscina", "Berço", "Aceita animais de estimação", "Elevador",
      "Estacionamento gratuito na rua", "Detector de fumaça", "Entrada privativa",
    ]);
    for (const key of keys) {
      expect(AMENITY_KEYS).toContain(key);
    }
    expect(keys).toContain("pool");
    expect(keys).toContain("crib");
    expect(keys).toContain("pet_friendly");
  });
});
