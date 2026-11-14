import { describe, expect, it } from "vitest";
import { analyzeSms, isGsm7 } from "./sms-segments";

describe("isGsm7", () => {
  it("aceita texto latino básico e acentos do alfabeto GSM", () => {
    expect(isGsm7("Ola! Voce ganhou 10% de desconto.")).toBe(true);
    expect(isGsm7("à noite, ñ é ü")).toBe(true);
  });

  it("rejeita emoji e caracteres fora da tabela", () => {
    expect(isGsm7("Promoção 🚀")).toBe(false);
    expect(isGsm7("aspas “curvas”")).toBe(false);
  });

  it("aceita a tabela de extensão", () => {
    expect(isGsm7("[chave] {teste} ~ | ^ € \\")).toBe(true);
  });
});

describe("analyzeSms — GSM-7", () => {
  it("texto vazio ocupa 1 segmento com 160 disponíveis", () => {
    expect(analyzeSms("")).toEqual({
      encoding: "GSM-7",
      chars: 0,
      segments: 1,
      perSegment: 160,
      remaining: 160,
    });
  });

  it("exatamente 160 chars ainda é 1 segmento", () => {
    const r = analyzeSms("a".repeat(160));
    expect(r.segments).toBe(1);
    expect(r.remaining).toBe(0);
  });

  it("161 chars quebra para 2 segmentos de 153", () => {
    const r = analyzeSms("a".repeat(161));
    expect(r).toMatchObject({ segments: 2, perSegment: 153, chars: 161, remaining: 145 });
  });

  it("306 chars cabem em 2 segmentos; 307 exigem 3", () => {
    expect(analyzeSms("a".repeat(306)).segments).toBe(2);
    expect(analyzeSms("a".repeat(307)).segments).toBe(3);
  });

  it("caracteres de extensão contam em dobro", () => {
    expect(analyzeSms("€").chars).toBe(2);
    // 80 chaves = 160 unidades → ainda 1 segmento; 81 → estoura.
    expect(analyzeSms("{".repeat(80)).segments).toBe(1);
    expect(analyzeSms("{".repeat(81)).segments).toBe(2);
  });
});

describe("analyzeSms — UCS-2", () => {
  it("emoji força unicode com limite de 70", () => {
    const r = analyzeSms("🚀");
    expect(r.encoding).toBe("UCS-2");
    expect(r.perSegment).toBe(70);
    expect(r.segments).toBe(1);
  });

  it("71 unidades unicode viram 2 segmentos de 67", () => {
    // 🚀 custa 2 unidades UTF-16 + 69 letras = 71.
    const r = analyzeSms("🚀" + "a".repeat(69));
    expect(r).toMatchObject({ encoding: "UCS-2", chars: 71, segments: 2, perSegment: 67 });
    expect(r.remaining).toBe(63);
  });

  it("conta emoji fora do BMP como par substituto (2 unidades)", () => {
    expect(analyzeSms("🚀🚀").chars).toBe(4);
  });
});
