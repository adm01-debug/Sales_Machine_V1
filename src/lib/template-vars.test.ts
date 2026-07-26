import { describe, expect, it } from "vitest";
import {
  buildVarValues,
  canonicalVar,
  extractVariables,
  parseVariables,
  renderForContact,
  renderTemplate,
  sampleVarValues,
  unknownVariables,
} from "./template-vars";

describe("canonicalVar", () => {
  it("resolve aliases conhecidos", () => {
    expect(canonicalVar("name")).toBe("nome");
    expect(canonicalVar("company")).toBe("empresa");
    expect(canonicalVar("NOME")).toBe("nome");
  });

  it("devolve null para variáveis fora do catálogo", () => {
    expect(canonicalVar("cpf")).toBeNull();
  });
});

describe("parseVariables / extractVariables", () => {
  it("captura variável simples e com fallback", () => {
    const parsed = parseVariables("Olá {{nome|cliente}}, da {{empresa}}");
    expect(parsed.map((p) => p.key)).toEqual(["nome", "empresa"]);
    expect(parsed[0].fallback).toBe("cliente");
    expect(parsed[1].fallback).toBeFalsy();
  });

  it("deduplica e normaliza aliases na extração", () => {
    expect(extractVariables("{{name}} {{nome}} {{company}}").sort()).toEqual(["empresa", "nome"]);
  });

  it("aponta variáveis desconhecidas", () => {
    expect(unknownVariables("Oi {{nome}}, seu {{cpf}}")).toEqual(["cpf"]);
  });

  it("ignora chaves simples que não são variáveis", () => {
    expect(extractVariables("valor { nome } sem duplas")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitui pelo valor do contato", () => {
    const r = renderTemplate("Olá {{nome}}, da {{empresa}}", {
      nome: "Ana",
      empresa: "Acme",
    });
    expect(r.text).toBe("Olá Ana, da Acme");
    expect(r.missing).toEqual([]);
  });

  it("usa o fallback quando o valor está ausente ou vazio", () => {
    const r = renderTemplate("Olá {{nome|cliente}}", { nome: "   " });
    expect(r.text).toBe("Olá cliente");
    expect(r.missing).toEqual([]);
  });

  it("reporta faltantes sem fallback e não deixa placeholder cru", () => {
    const r = renderTemplate("Olá {{nome}}", { nome: null });
    expect(r.text).not.toContain("{{");
    expect(r.missing).toEqual(["nome"]);
  });

  it("mantém variáveis desconhecidas literais para expor erro de autoria", () => {
    const r = renderTemplate("Seu {{cpf}}", {});
    expect(r.text).toContain("{{cpf}}");
  });

  it("resolve aliases usando o valor canônico", () => {
    expect(renderTemplate("{{name}}", { nome: "Ana" }).text).toBe("Ana");
  });

  it("não quebra com template vazio", () => {
    expect(renderTemplate("", {}).text).toBe("");
  });
});

describe("buildVarValues / renderForContact", () => {
  it("deriva primeiro nome a partir do display_name", () => {
    const values = buildVarValues({ display_name: "Ana Souza", metadata: null });
    expect(values.nome).toBe("Ana Souza");
    expect(values.primeiro_nome).toBe("Ana");
  });

  it("tolera contato sem nome nem metadata", () => {
    const text = renderForContact("Olá {{nome|tudo bem}}", {
      display_name: null,
      metadata: null,
    });
    expect(text).toBe("Olá tudo bem");
  });

  it("ignora metadata com tipos inesperados sem lançar", () => {
    expect(() =>
      renderForContact("{{empresa}}", {
        display_name: "X",
        metadata: { company_name: { nested: true } } as Record<string, unknown>,
      }),
    ).not.toThrow();
  });
});

describe("sampleVarValues", () => {
  it("preenche todas as variáveis do catálogo", () => {
    const sample = sampleVarValues();
    const rendered = renderTemplate("{{nome}} {{empresa}} {{cargo}} {{cidade}} {{site}} {{email}}", sample);
    expect(rendered.missing).toEqual([]);
  });
});