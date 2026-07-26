import { describe, it, expect } from "vitest";
import {
  moveBlock,
  newBlock,
  parseBlocks,
  renderEmailHtml,
  renderEmailText,
  safeUrl,
  validateBlocks,
  type EmailBlock,
} from "./email-blocks";

const sample: EmailBlock[] = [
  { id: "a", type: "heading", text: "Olá {{nome}}", level: 1 },
  { id: "b", type: "text", text: "Linha 1\nLinha 2" },
  { id: "c", type: "button", text: "Agendar", url: "https://ex.com/a" },
  { id: "d", type: "image", url: "https://ex.com/i.png", alt: "logo" },
  { id: "e", type: "divider" },
  { id: "f", type: "spacer", size: 32 },
];

describe("safeUrl", () => {
  it("aceita http, https e mailto", () => {
    expect(safeUrl("https://a.com")).toBe("https://a.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  it("rejeita javascript: e vazios", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("  ")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe("validateBlocks", () => {
  it("aprova blocos válidos", () => {
    expect(validateBlocks(sample)).toEqual([]);
  });
  it("exige ao menos um bloco", () => {
    expect(validateBlocks([])).toHaveLength(1);
  });
  it("detecta url insegura no botão", () => {
    const issues = validateBlocks([{ id: "x", type: "button", text: "ok", url: "javascript:1" }]);
    expect(issues[0].message).toMatch(/URL do botão/);
  });
  it("exige alt na imagem", () => {
    const issues = validateBlocks([{ id: "x", type: "image", url: "https://a/i.png" }]);
    expect(issues.some((i) => /alt/.test(i.message))).toBe(true);
  });
  it("detecta ids duplicados", () => {
    const issues = validateBlocks([
      { id: "x", type: "divider" },
      { id: "x", type: "divider" },
    ]);
    expect(issues.some((i) => /duplicado/.test(i.message))).toBe(true);
  });
  it("limita o espaçador", () => {
    expect(validateBlocks([{ id: "s", type: "spacer", size: 999 }])).toHaveLength(1);
  });
});

describe("renderEmailHtml", () => {
  const html = renderEmailHtml(sample, { subject: "Assunto" });
  it("gera documento completo", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("max-width:600px");
  });
  it("escapa conteúdo do usuário", () => {
    const evil = renderEmailHtml([{ id: "x", type: "text", text: "<script>x</script>" }]);
    expect(evil).not.toContain("<script>");
    expect(evil).toContain("&lt;script&gt;");
  });
  it("preserva variáveis para o motor de template", () => {
    expect(html).toContain("{{nome}}");
  });
  it("converte quebras de linha em <br />", () => {
    expect(html).toContain("Linha 1<br />Linha 2");
  });
  it("ignora imagem sem url válida", () => {
    expect(renderEmailHtml([{ id: "i", type: "image", url: "ftp://x" }])).not.toContain("<img");
  });
});

describe("renderEmailText", () => {
  it("gera fallback legível", () => {
    const text = renderEmailText(sample);
    expect(text).toContain("Agendar: https://ex.com/a");
    expect(text).toContain("[imagem] logo");
    expect(text).not.toContain("<");
  });
});

describe("moveBlock", () => {
  it("move para cima e para baixo", () => {
    const list = [newBlock("text", "1"), newBlock("text", "2")];
    expect(moveBlock(list, 1, -1).map((b) => b.id)).toEqual(["2", "1"]);
    expect(moveBlock(list, 0, 1).map((b) => b.id)).toEqual(["2", "1"]);
  });
  it("ignora movimentos fora dos limites", () => {
    const list = [newBlock("text", "1")];
    expect(moveBlock(list, 0, -1)).toBe(list);
  });
});

describe("parseBlocks", () => {
  it("descarta lixo e completa defaults", () => {
    const parsed = parseBlocks([{ type: "spacer" }, { type: "nope" }, null, "x"]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: "spacer", size: 24 });
  });
  it("retorna vazio para não-array", () => {
    expect(parseBlocks(null)).toEqual([]);
  });
});
