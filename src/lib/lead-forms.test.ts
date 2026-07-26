import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELDS,
  HONEYPOT_KEY,
  normalizeEmail,
  normalizePhone,
  parseFieldsSafe,
  slugify,
  validateSubmission,
  type LeadField,
} from "./lead-forms";

const fields: LeadField[] = [
  { key: "nome", label: "Nome", type: "text", required: true, options: [] },
  { key: "email", label: "E-mail", type: "email", required: true, options: [] },
  { key: "telefone", label: "Telefone", type: "phone", required: false, options: [] },
  { key: "porte", label: "Porte", type: "select", required: false, options: ["PME", "Enterprise"] },
  { key: "newsletter", label: "Novidades", type: "checkbox", required: false, options: [] },
];

const base = { nome: "Ana Souza", email: " ANA@Exemplo.com " };

describe("slugify", () => {
  it("normaliza acentos, espaços e maiúsculas", () => {
    expect(slugify("Materiais para Gestão de RH")).toBe("materiais-para-gestao-de-rh");
  });
  it("não deixa hífen sobrando", () => {
    expect(slugify("  --Olá!!  ")).toBe("ola");
  });
});

describe("normalizeEmail / normalizePhone", () => {
  it("aceita e-mail válido em minúsculas", () => {
    expect(normalizeEmail(" Foo@Bar.com ")).toBe("foo@bar.com");
  });
  it("rejeita e-mail inválido", () => {
    expect(normalizeEmail("foo@bar")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
  it("converte telefone brasileiro para E.164", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("+5511988887777");
    expect(normalizePhone("+55 11 98888-7777")).toBe("+5511988887777");
  });
  it("rejeita telefone curto", () => {
    expect(normalizePhone("1234")).toBeNull();
  });
});

describe("validateSubmission", () => {
  it("aprova envio completo e normaliza o e-mail", () => {
    const r = validateSubmission(fields, base, true);
    expect(r.ok).toBe(true);
    expect(r.email).toBe("ana@exemplo.com");
    expect(r.fullName).toBe("Ana Souza");
  });

  it("exige consentimento", () => {
    const r = validateSubmission(fields, base, false);
    expect(r.ok).toBe(false);
    expect(r.errors.__consent).toBeTruthy();
  });

  it("acusa campos obrigatórios vazios", () => {
    const r = validateSubmission(fields, { email: "a@b.com" }, true);
    expect(r.errors.nome).toBe("Campo obrigatório");
  });

  it("rejeita e-mail e telefone inválidos", () => {
    const r = validateSubmission(fields, { ...base, email: "x", telefone: "12" }, true);
    expect(r.errors.email).toBe("E-mail inválido");
    expect(r.errors.telefone).toBe("Telefone inválido");
  });

  it("rejeita opção fora da lista", () => {
    const r = validateSubmission(fields, { ...base, porte: "Gigante" }, true);
    expect(r.errors.porte).toBe("Opção inválida");
  });

  it("aceita checkbox marcado em qualquer formato", () => {
    expect(validateSubmission(fields, { ...base, newsletter: "on" }, true).values.newsletter).toBe(true);
    expect(validateSubmission(fields, { ...base, newsletter: true }, true).values.newsletter).toBe(true);
    expect(validateSubmission(fields, base, true).values.newsletter).toBe(false);
  });

  it("marca robô quando o honeypot vem preenchido", () => {
    const r = validateSubmission(fields, { ...base, [HONEYPOT_KEY]: "spam" }, true);
    expect(r.isBot).toBe(true);
  });

  it("corta texto absurdamente longo", () => {
    const r = validateSubmission(fields, { ...base, nome: "a".repeat(2500) }, true);
    expect(r.errors.nome).toBe("Texto muito longo");
  });

  it("normaliza telefone para E.164 no resultado", () => {
    const r = validateSubmission(fields, { ...base, telefone: "11988887777" }, true);
    expect(r.phone).toBe("+5511988887777");
  });
});

describe("parseFieldsSafe", () => {
  it("devolve os campos padrão intactos", () => {
    expect(parseFieldsSafe(DEFAULT_FIELDS)).toHaveLength(3);
  });
  it("devolve lista vazia para conteúdo inválido", () => {
    expect(parseFieldsSafe([{ key: "Nome Inválido" }])).toEqual([]);
    expect(parseFieldsSafe(null)).toEqual([]);
  });
});