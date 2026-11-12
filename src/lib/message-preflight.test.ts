import { describe, expect, it } from "vitest";
import { blockingMessageFindings, preflightMessage } from "./message-preflight";

const codes = (r: ReturnType<typeof preflightMessage>) => r.findings.map((f) => f.code);

describe("preflightMessage", () => {
  it("aprova uma mensagem de WhatsApp bem escrita", () => {
    const r = preflightMessage({
      channel: "whatsapp",
      body: "Oi {{primeiro_nome|tudo bem}}, posso te mandar um estudo de 2 min? Responda SAIR para não receber mais.",
    });
    expect(codes(r)).toEqual([]);
    expect(r.score).toBe(100);
  });

  it("bloqueia corpo vazio", () => {
    const r = preflightMessage({ channel: "sms", body: "   " });
    expect(codes(r)).toEqual(["empty_body"]);
    expect(blockingMessageFindings(r)).toHaveLength(1);
  });

  it("cobra opt-out em SMS e WhatsApp, mas não no LinkedIn", () => {
    expect(
      codes(preflightMessage({ channel: "sms", body: "Oi {{nome|olá}}, tudo certo?" })),
    ).toContain("no_optout");
    expect(
      codes(preflightMessage({ channel: "linkedin", body: "Oi {{nome|olá}}, tudo certo?" })),
    ).not.toContain("no_optout");
  });

  it("sinaliza custo de SMS em UCS-2 e multi-segmento", () => {
    const r = preflightMessage({
      channel: "sms",
      body: `Olá {{nome|cliente}} 😀 ${"detalhe ".repeat(40)} responda SAIR`,
    });
    expect(codes(r)).toContain("sms_unicode");
    expect(codes(r)).toContain("sms_segments");
    expect(r.smsSegments).toBeGreaterThan(3);
  });

  it("detecta encurtador, link inseguro e excesso de links", () => {
    const r = preflightMessage({
      channel: "whatsapp",
      body: "Veja https://bit.ly/a e http://acme.com.br/b e https://acme.com.br/c — responda SAIR. {{nome|oi}}",
    });
    expect(codes(r)).toContain("shortener");
    expect(codes(r)).toContain("insecure_link");
    expect(codes(r)).toContain("too_many_links");
    expect(r.linkCount).toBe(3);
  });

  it("eleva a severidade com 3+ gatilhos de spam", () => {
    const r = preflightMessage({
      channel: "whatsapp",
      body: "Clique aqui e ganhe dinheiro com renda extra! Responda SAIR. {{nome|oi}}",
    });
    expect(r.findings.find((f) => f.code === "spam_words")?.severity).toBe("error");
  });

  it("avisa sobre caixa alta e excesso de emoji", () => {
    const r = preflightMessage({
      channel: "instagram",
      body: "PROMOÇÃO LIBERADA PARA VOCE AGORA 🎉🎊🥳🔥🚀🎯 {{nome|oi}}",
    });
    expect(codes(r)).toContain("all_caps");
    expect(codes(r)).toContain("emoji_heavy");
  });

  it("informa ausência de mídia em MMS/RCS e de personalização", () => {
    const r = preflightMessage({ channel: "mms", body: "Segue o catálogo do mês." });
    expect(codes(r)).toContain("no_media");
    expect(codes(r)).toContain("no_personalization");
    expect(
      codes(preflightMessage({ channel: "mms", body: "Catálogo", mediaUrl: "https://x/y.jpg" })),
    ).not.toContain("no_media");
  });

  it("mantém o score entre 0 e 100", () => {
    const r = preflightMessage({
      channel: "sms",
      body: "GANHE DINHEIRO URGENTE COM RENDA EXTRA 🎉🎊🥳🔥🚀🎯 https://bit.ly/x http://a.com/b",
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
