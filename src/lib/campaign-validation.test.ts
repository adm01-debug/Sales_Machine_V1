import { describe, expect, it } from "vitest";
import {
  CHANNEL_BODY_LIMIT,
  hasBlockingIssues,
  validateCampaign,
  type CampaignForValidation,
} from "./campaign-validation";

const base = (over: Partial<CampaignForValidation> = {}): CampaignForValidation => ({
  name: "Campanha teste",
  channel: "whatsapp",
  audience_id: "aud-1",
  audience_size: 10,
  variants: [{ label: "A", body: "Olá {{nome|tudo bem}}", split_percent: 100 }],
  ...over,
});

const errors = (input: CampaignForValidation) =>
  validateCampaign(input).filter((i) => i.level === "error");

describe("validateCampaign — casos felizes", () => {
  it("não gera erros para uma campanha bem formada", () => {
    expect(errors(base())).toEqual([]);
  });

  it("aceita split A/B somando 100", () => {
    const issues = errors(
      base({
        variants: [
          { label: "A", body: "oi {{nome|olá}}", split_percent: 60 },
          { label: "B", body: "olá {{nome|olá}}", split_percent: 40 },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });
});

describe("validateCampaign — bloqueios estruturais", () => {
  it("exige nome", () => {
    expect(errors(base({ name: "   " }))[0].scope).toBe("Campanha");
  });

  it("exige audiência", () => {
    expect(errors(base({ audience_id: null }))[0].scope).toBe("Audiência");
  });

  it("bloqueia audiência vazia", () => {
    expect(
      errors(base({ audience_size: 0 })).some((i) => i.message.includes("vazia")),
    ).toBe(true);
  });

  it("exige ao menos uma variante e interrompe as demais checagens", () => {
    const issues = validateCampaign(base({ variants: [] }));
    expect(issues.at(-1)?.scope).toBe("Variantes");
  });

  it("bloqueia split diferente de 100", () => {
    expect(
      errors(base({ variants: [{ label: "A", body: "oi", split_percent: 90 }] })).some((i) =>
        i.message.includes("100%"),
      ),
    ).toBe(true);
  });

  it("bloqueia rótulos duplicados", () => {
    const issues = errors(
      base({
        variants: [
          { label: "A", body: "oi", split_percent: 50 },
          { label: "A", body: "oi", split_percent: 50 },
        ],
      }),
    );
    expect(issues.some((i) => i.message.includes("duplicado"))).toBe(true);
  });

  it("bloqueia corpo vazio", () => {
    expect(
      errors(base({ variants: [{ label: "A", body: "   ", split_percent: 100 }] })).some((i) =>
        i.message.includes("vazio"),
      ),
    ).toBe(true);
  });
});

describe("validateCampaign — regras por canal", () => {
  it("bloqueia corpo acima do limite do canal", () => {
    const body = "a".repeat(CHANNEL_BODY_LIMIT.instagram + 1);
    expect(
      errors(
        base({ channel: "instagram", variants: [{ label: "A", body, split_percent: 100 }] }),
      ).some((i) => i.message.includes("excede o limite")),
    ).toBe(true);
  });

  it("exige assunto no e-mail e avisa quando ele aparece fora do e-mail", () => {
    expect(
      errors(base({ channel: "email" })).some((i) => i.message.includes("assunto")),
    ).toBe(true);

    const warnings = validateCampaign(
      base({
        variants: [{ label: "A", body: "oi", subject: "Assunto", split_percent: 100 }],
      }),
    ).filter((i) => i.level === "warning");
    expect(warnings.some((i) => i.message.includes("ignorado"))).toBe(true);
  });

  it("exige mídia no MMS", () => {
    expect(errors(base({ channel: "mms" })).some((i) => i.message.includes("mídia"))).toBe(true);
    expect(
      errors(
        base({
          channel: "mms",
          variants: [
            { label: "A", body: "oi", media_url: "https://x/y.jpg", split_percent: 100 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("exige rich card no RCS e limita as sugestões a 4", () => {
    expect(errors(base({ channel: "rcs" })).some((i) => i.message.includes("rich card"))).toBe(
      true,
    );

    const tooMany = errors(
      base({
        channel: "rcs",
        variants: [
          {
            label: "A",
            body: "oi",
            rcs_payload: { title: "T", suggestions: [1, 2, 3, 4, 5] },
            split_percent: 100,
          },
        ],
      }),
    );
    expect(tooMany.some((i) => i.message.includes("4 ações"))).toBe(true);
  });

  it("avisa sobre SMS longo sem bloquear", () => {
    const issues = validateCampaign(
      base({
        channel: "sms",
        variants: [{ label: "A", body: "a".repeat(500), split_percent: 100 }],
      }),
    );
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.some((i) => i.message.includes("segmentos"))).toBe(true);
  });
});

describe("validateCampaign — variáveis", () => {
  it("bloqueia variável desconhecida", () => {
    expect(
      errors(base({ variants: [{ label: "A", body: "Oi {{cpf}}", split_percent: 100 }] })).some(
        (i) => i.message.includes("desconhecida"),
      ),
    ).toBe(true);
  });

  it("emite um único aviso por variável sem texto padrão", () => {
    const warnings = validateCampaign(
      base({ variants: [{ label: "A", body: "{{nome}} … {{nome}}", split_percent: 100 }] }),
    ).filter((i) => i.message.includes("não tem texto padrão"));
    expect(warnings).toHaveLength(1);
  });

  it("avisa quando o template veio de outro canal", () => {
    const issues = validateCampaign(
      base({
        variants: [
          { label: "A", body: "oi", source_channel: "sms", split_percent: 100 },
        ],
      }),
    );
    expect(issues.some((i) => i.message.includes("template de sms"))).toBe(true);
  });
});

describe("hasBlockingIssues", () => {
  it("só bloqueia quando existe erro", () => {
    expect(hasBlockingIssues([{ level: "warning", scope: "x", message: "y" }])).toBe(false);
    expect(hasBlockingIssues([{ level: "error", scope: "x", message: "y" }])).toBe(true);
  });
});