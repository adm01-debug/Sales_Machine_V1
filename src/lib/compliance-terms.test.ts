import { describe, expect, it } from "vitest";
import { auditCompliance, normalizeForCompliance } from "./compliance-terms";

describe("normalizeForCompliance", () => {
  it("remove acentos e resolve leetspeak", () => {
    expect(normalizeForCompliance("G4NH0 FÁC1L")).toBe("ganho facil");
  });

  it("elimina separadores internos usados para ofuscar", () => {
    expect(normalizeForCompliance("c-u.r_a")).toBe("cura");
  });
});

describe("auditCompliance", () => {
  it("retorna 100 para texto vazio", () => {
    const r = auditCompliance({ text: "   " });
    expect(r.score).toBe(100);
    expect(r.blocked).toBe(false);
  });

  it("detecta termo do nicho de saúde e bloqueia", () => {
    const r = auditCompliance({ text: "Nosso produto promove a cura total.", niches: ["saude"] });
    expect(r.blocked).toBe(true);
    expect(r.violations[0]?.term).toBe("cura");
    expect(r.score).toBeLessThan(100);
  });

  it("não gera falso positivo em substring", () => {
    const r = auditCompliance({ text: "Trabalho de curadoria de conteúdo.", niches: ["saude"] });
    expect(r.violations).toHaveLength(0);
  });

  it("detecta termo ofuscado do nicho de apostas", () => {
    const r = auditCompliance({ text: "g4nh0 f4cil todo dia", niches: ["apostas"] });
    expect(r.blocked).toBe(true);
  });

  it("aplica termos customizados do cliente", () => {
    const r = auditCompliance({
      text: "Use o cupom interno CONCORRENTEX agora",
      customRules: [{ term: "concorrentex", severity: "error", reason: "Marca de terceiro." }],
    });
    expect(r.violations.some((v) => v.niche === "custom")).toBe(true);
  });

  it("ordena violações por severidade e evita duplicatas", () => {
    const r = auditCompliance({
      text: "Resultado garantido, lucro certo e última chance.",
      niches: ["geral", "financeiro"],
      customRules: [{ term: "garantido", severity: "info", reason: "duplicado" }],
    });
    expect(r.violations[0]?.severity).toBe("error");
    expect(r.violations.filter((v) => v.term === "garantido")).toHaveLength(1);
  });

  it("nunca produz score negativo", () => {
    const r = auditCompliance({
      text: "lucro certo, investimento sem risco, renda passiva garantida, rentabilidade garantida",
      niches: ["financeiro"],
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});