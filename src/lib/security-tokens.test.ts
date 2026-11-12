import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { safeEqualString, signPayload, verifyHmac } from "./hmac.server";
import {
  detectStopWord,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token.server";

const SECRET = "s3cr3t-webhook";
const hex = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

describe("verifyHmac", () => {
  const body = JSON.stringify({ event: "email.opened", id: 42 });

  it("aceita assinatura hex crua e com prefixo sha256=", () => {
    expect(verifyHmac(body, hex(body), SECRET)).toBe(true);
    expect(verifyHmac(body, `sha256=${hex(body)}`, SECRET)).toBe(true);
  });

  it("aceita a própria assinatura gerada por signPayload", () => {
    expect(verifyHmac(body, signPayload(body, SECRET), SECRET)).toBe(true);
  });

  it("rejeita corpo adulterado, segredo errado e assinatura de outro corpo", () => {
    expect(verifyHmac(body + " ", hex(body), SECRET)).toBe(false);
    expect(verifyHmac(body, hex(body, "outro"), SECRET)).toBe(false);
    expect(verifyHmac(body, hex("{}"), SECRET)).toBe(false);
  });

  it("rejeita cabeçalho ausente ou segredo não configurado", () => {
    expect(verifyHmac(body, null, SECRET)).toBe(false);
    expect(verifyHmac(body, "", SECRET)).toBe(false);
    expect(verifyHmac(body, hex(body), undefined)).toBe(false);
    expect(verifyHmac(body, hex(body), "")).toBe(false);
  });

  it("não quebra com hex inválido, tamanho errado ou lixo binário", () => {
    for (const bad of ["zz", "abc", "sha256=", "não-hex", "00".repeat(31), "00".repeat(33)]) {
      expect(verifyHmac(body, bad, SECRET)).toBe(false);
    }
  });

  it("é insensível a maiúsculas no hex (normalização do provedor)", () => {
    expect(verifyHmac(body, hex(body).toUpperCase(), SECRET)).toBe(true);
  });

  it("valida corpo vazio corretamente", () => {
    expect(verifyHmac("", hex(""), SECRET)).toBe(true);
    expect(verifyHmac("", hex("x"), SECRET)).toBe(false);
  });
});

describe("safeEqualString", () => {
  it("compara tokens sem vazar tamanho por exceção", () => {
    expect(safeEqualString("abc", "abc")).toBe(true);
    expect(safeEqualString("abc", "abd")).toBe(false);
    expect(safeEqualString("abc", "abcd")).toBe(false);
    expect(safeEqualString("", "")).toBe(true);
  });
});

describe("token de descadastro", () => {
  beforeEach(() => {
    vi.stubEnv("SM_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  const entity = "4e2f1c8a-0000-4000-8000-000000000001";

  it("faz round-trip preservando entidade e canal", () => {
    const token = signUnsubscribeToken(entity, "email");
    expect(verifyUnsubscribeToken(token)).toEqual({ entityId: entity, channel: "email" });
  });

  it("gera token seguro para URL (sem +, / ou =)", () => {
    const token = signUnsubscribeToken(entity, "whatsapp");
    expect(token).toMatch(/^[A-Za-z0-9\-_]+\.[0-9a-f]{64}$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("rejeita payload adulterado mantendo a assinatura original", () => {
    const [body, sig] = signUnsubscribeToken(entity, "email").split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "outra-entidade", c: "email", x: 9_999_999_999 }),
    )
      .toString("base64")
      .replace(/=+$/, "");
    expect(verifyUnsubscribeToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${body}.${"0".repeat(64)}`)).toBeNull();
  });

  it("rejeita formatos malformados sem lançar", () => {
    for (const bad of ["", ".", "abc", "abc.", ".abc", "a.b.c", "não!.zz"]) {
      expect(verifyUnsubscribeToken(bad)).toBeNull();
    }
  });

  it("rejeita token expirado e aceita dentro da validade", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signUnsubscribeToken(entity, "sms", 3600);

    vi.setSystemTime(new Date("2026-01-01T00:59:00Z"));
    expect(verifyUnsubscribeToken(token)).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T01:00:01Z"));
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("token assinado com outro segredo não é aceito", () => {
    const token = signUnsubscribeToken(entity, "email");
    vi.stubEnv("SM_WEBHOOK_SECRET", "segredo-rotacionado");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("falha explicitamente quando não há segredo configurado", () => {
    vi.stubEnv("SM_WEBHOOK_SECRET", "");
    vi.stubEnv("AGENT_TOOL_TOKEN", "");
    expect(() => signUnsubscribeToken(entity, "email")).toThrow(/SM_WEBHOOK_SECRET/);
  });
});

describe("detectStopWord", () => {
  it("detecta palavras de parada isoladas ou em frases", () => {
    for (const t of [
      "PARE",
      "pare",
      "  parar ",
      "Stop",
      "quero cancelar",
      "SAIR!",
      "Unsubscribe",
    ]) {
      expect(detectStopWord(t)).toBe(true);
    }
  });

  it("ignora vazio, nulo e indefinido", () => {
    expect(detectStopWord("")).toBe(false);
    expect(detectStopWord(null)).toBe(false);
    expect(detectStopWord(undefined)).toBe(false);
  });

  it("não dispara em substrings de outras palavras", () => {
    for (const t of ["parece interessante", "comparar preços", "saindo agora", "stopwatch"]) {
      expect(detectStopWord(t)).toBe(false);
    }
  });

  it("tolera pontuação, emojis e quebras de linha ao redor", () => {
    expect(detectStopWord("Olá,\n**PARE**! 🚫")).toBe(true);
    expect(detectStopWord("obrigado, mas descadastrar por favor")).toBe(true);
  });
});
