import { describe, expect, it } from "vitest";
import {
  preflightEmail,
  preflightEmailContent,
  blockingFindings,
  scoreLabel,
  findSpamTriggers,
  GMAIL_CLIP_BYTES,
} from "./email-preflight";
import type { EmailBlock } from "./email-blocks";

const codes = (r: ReturnType<typeof preflightEmail>) => r.findings.map((f) => f.code);

const goodBlocks: EmailBlock[] = [
  { id: "1", type: "heading", text: "Como a {{empresa|sua empresa}} reduz custo de aquisição" },
  {
    id: "2",
    type: "text",
    text: "Olá {{primeiro_nome|tudo bem}}, separei um estudo com três empresas do seu segmento que reduziram o custo por reunião em 40% ao consolidar prospecção e CRM em um único fluxo. Posso te mostrar em 15 minutos como aplicaríamos isso no seu contexto?",
  },
  { id: "3", type: "button", text: "Ver agenda", url: "https://acme.com.br/agenda" },
  { id: "4", type: "text", text: "Se preferir, clique para descadastrar desta lista." },
];

describe("preflightEmail", () => {
  it("aprova um e-mail bem construído", () => {
    const r = preflightEmail({ subject: "Estudo de caso do seu segmento", blocks: goodBlocks });
    expect(codes(r)).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.linkCount).toBe(1);
    expect(r.imageCount).toBe(0);
  });

  it("exige assunto", () => {
    const r = preflightEmail({ subject: "   ", blocks: goodBlocks });
    expect(codes(r)).toContain("subject_missing");
    expect(r.score).toBeLessThan(100);
  });

  it("sinaliza assunto longo, caixa alta e pontuação excessiva", () => {
    const r = preflightEmail({
      subject: `OFERTA EXCLUSIVA PARA SUA EMPRESA HOJE MESMO SEM COMPROMISSO ALGUM AGORA JÁ!!!`,
      blocks: goodBlocks,
    });
    expect(codes(r)).toContain("subject_uppercase");
    expect(codes(r)).toContain("subject_punctuation");
  });

  it("bloqueia e-mail sem blocos", () => {
    const r = preflightEmail({ subject: "Oi", blocks: [] });
    expect(codes(r)).toContain("no_blocks");
  });

  it("detecta ausência de descadastro", () => {
    const blocks = goodBlocks.slice(0, 3);
    const r = preflightEmail({ subject: "Estudo de caso", blocks });
    expect(codes(r)).toContain("no_unsubscribe");
  });

  it("detecta e-mail só com imagem", () => {
    const blocks: EmailBlock[] = [
      { id: "i", type: "image", url: "https://cdn.acme.com/a.png", alt: "Banner" },
    ];
    const r = preflightEmail({ subject: "Novidade", blocks });
    const c = codes(r);
    expect(c).toContain("low_text");
    expect(r.findings.find((f) => f.code === "low_text")?.severity).toBe("error");
  });

  it("detecta proporção texto/imagem baixa", () => {
    const blocks: EmailBlock[] = [
      { id: "t", type: "text", text: "Veja o material. Para descadastrar responda esta mensagem." },
      { id: "i1", type: "image", url: "https://cdn.acme.com/a.png", alt: "a" },
      { id: "i2", type: "image", url: "https://cdn.acme.com/b.png", alt: "b" },
    ];
    const r = preflightEmail({ subject: "Material {{empresa}}", blocks });
    expect(codes(r)).toContain("image_heavy");
  });

  it("detecta gatilhos de spam e eleva a severidade com 3+ ocorrências", () => {
    const blocks: EmailBlock[] = [
      {
        id: "t",
        type: "text",
        text: "Clique aqui e ganhe dinheiro com renda extra sem custo. Para descadastrar, responda. Enviamos este conteúdo com base no seu interesse recente em nossos materiais educativos.",
      },
    ];
    const r = preflightEmail({ subject: "Urgente", blocks });
    const f = r.findings.find((x) => x.code === "spam_words");
    expect(f?.severity).toBe("error");
  });

  it("detecta encurtadores de URL", () => {
    const blocks: EmailBlock[] = [
      ...goodBlocks.slice(0, 2),
      { id: "b", type: "button", text: "Abrir", url: "https://bit.ly/abc" },
      { id: "u", type: "text", text: "Para descadastrar, responda este e-mail." },
    ];
    const r = preflightEmail({ subject: "Convite", blocks });
    expect(codes(r)).toContain("shortener");
  });

  it("sinaliza excesso de links", () => {
    const links: EmailBlock[] = Array.from({ length: 13 }, (_, i) => ({
      id: `b${i}`,
      type: "button" as const,
      text: `Link ${i}`,
      url: `https://acme.com.br/${i}`,
    }));
    const r = preflightEmail({
      subject: "Links",
      blocks: [...goodBlocks.slice(0, 2), ...links, goodBlocks[3]],
    });
    expect(codes(r)).toContain("too_many_links");
  });

  it("avisa sobre clipping do Gmail", () => {
    const big = "a".repeat(GMAIL_CLIP_BYTES + 1000);
    const r = preflightEmail({
      subject: "Longo",
      blocks: [{ id: "t", type: "text", text: `${big} descadastrar` }],
    });
    expect(codes(r)).toContain("gmail_clipping");
    expect(r.htmlBytes).toBeGreaterThan(GMAIL_CLIP_BYTES);
  });

  it("aponta falta de personalização e de fallback", () => {
    const blocks: EmailBlock[] = [
      {
        id: "t",
        type: "text",
        text: "Boa tarde, seguem os detalhes combinados na nossa última conversa sobre integração de dados e automação comercial. Para descadastrar, responda esta mensagem.",
      },
    ];
    const r = preflightEmail({ subject: "Detalhes", blocks });
    expect(codes(r)).toContain("no_personalization");

    const r2 = preflightEmail({
      subject: "Detalhes {{empresa}}",
      blocks,
    });
    expect(codes(r2)).toContain("var_without_fallback");
  });

  it("mantém o score entre 0 e 100", () => {
    const r = preflightEmail({ subject: "", blocks: [] });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("scoreLabel", () => {
  it("classifica faixas", () => {
    expect(scoreLabel(100)).toBe("excelente");
    expect(scoreLabel(75)).toBe("bom");
    expect(scoreLabel(50)).toBe("atenção");
    expect(scoreLabel(10)).toBe("crítico");
  });
});

describe("preflightEmailContent", () => {
  it("ignora falsos positivos e normaliza acentos nos gatilhos", () => {
    expect(findSpamTriggers("Pedido urgentemente revisado")).toEqual([]);
    expect(findSpamTriggers("Material gratis para o time")).toEqual(["grátis"]);
    expect(findSpamTriggers("GRÁTIS e grátis")).toEqual(["grátis"]);
    expect(findSpamTriggers("Acesse https://acme.com.br/renda-extra/urgente")).toEqual([]);
    expect(findSpamTriggers("Clique aqui, é urgente!")).toEqual(["clique aqui", "urgente"]);
  });

  it("usa os blocos quando existem", () => {
    const r = preflightEmailContent({ subject: "Estudo", blocks: goodBlocks });
    expect(codes(r)).toEqual([]);
  });

  it("converte corpo em texto quando não há blocos", () => {
    const r = preflightEmailContent({
      subject: "Estudo de caso {{empresa|sua empresa}}",
      blocks: [],
      body: "Olá, separei um estudo com três empresas do seu segmento que reduziram o custo por reunião em 40%. Posso mostrar em 15 minutos? Para descadastrar, responda esta mensagem.",
    });
    expect(codes(r)).not.toContain("no_blocks");
    expect(codes(r)).not.toContain("no_unsubscribe");
  });

  it("reporta ausência de conteúdo quando nada é informado", () => {
    const r = preflightEmailContent({ subject: "Oi", blocks: null, body: "   " });
    expect(codes(r)).toContain("no_blocks");
    expect(blockingFindings(r).length).toBeGreaterThan(0);
  });
});
