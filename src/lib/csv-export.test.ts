import { describe, it, expect } from "vitest";
import { escapeCsvValue, toCsv, csvFilename } from "./csv-export";

describe("escapeCsvValue", () => {
  it("devolve vazio para nulo e indefinido", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("não aspeia valores simples", () => {
    expect(escapeCsvValue("queued")).toBe("queued");
    expect(escapeCsvValue(42)).toBe("42");
  });

  it("aspeia e duplica aspas internas", () => {
    expect(escapeCsvValue('erro "timeout"')).toBe('"erro ""timeout"""');
  });

  it("aspeia vírgulas e quebras de linha", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("neutraliza fórmulas (CSV injection)", () => {
    expect(escapeCsvValue("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvValue("+1")).toBe("'+1");
    expect(escapeCsvValue("@cmd")).toBe("'@cmd");
  });

  it("aspeia fórmula que também contém vírgula", () => {
    expect(escapeCsvValue("=SUM(1,2)")).toBe(`"'=SUM(1,2)"`);
  });
});

describe("toCsv", () => {
  const columns = [
    { key: "id", header: "ID", value: (r: { id: string; reason: string | null }) => r.id },
    { key: "reason", header: "Motivo", value: (r: { reason: string | null }) => r.reason },
  ];

  it("emite apenas o cabeçalho quando não há linhas", () => {
    expect(toCsv([], columns)).toBe("ID,Motivo");
  });

  it("usa CRLF entre as linhas", () => {
    const csv = toCsv([{ id: "a", reason: "manual_requeue" }], columns);
    expect(csv).toBe("ID,Motivo\r\na,manual_requeue");
  });

  it("preserva a coluna vazia quando o valor é nulo", () => {
    expect(toCsv([{ id: "a", reason: null }], columns)).toBe("ID,Motivo\r\na,");
  });
});

describe("csvFilename", () => {
  it("gera nome ordenável sem caracteres inválidos", () => {
    expect(csvFilename("auditoria", new Date("2026-07-26T12:34:56.000Z"))).toBe(
      "auditoria-2026-07-26T12-34-56.csv",
    );
  });
});
