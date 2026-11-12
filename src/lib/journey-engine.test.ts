import { describe, expect, it } from "vitest";
import {
  BUDGET_DEFER_MS,
  clampToSendWindow,
  decideJourneyAction,
  evaluateCondition,
  evaluateConditionGroup,
  findEdge,
  findWaitlessCycle,
  parseConditions,
  parseSplitBranches,
  pickSplitBranch,
  readField,
  validateJourney,
  waitDurationMs,
  type JourneyEdge,
  type JourneyFacts,
  type JourneyNode,
} from "./journey-engine";

const NOW = Date.parse("2026-07-26T12:00:00.000Z"); // domingo, 12h UTC

const node = (over: Partial<JourneyNode> & Pick<JourneyNode, "id" | "kind">): JourneyNode => ({
  label: "",
  config: {},
  ...over,
});

const facts = (over: Partial<JourneyFacts> & Pick<JourneyFacts, "node">): JourneyFacts => ({
  edges: [],
  profile: {},
  consentAllowed: true,
  requiresHumanApproval: false,
  seed: "seed-1",
  sendWindowStart: 0,
  sendWindowEnd: 24,
  now: NOW,
  ...over,
});

describe("readField", () => {
  it("lê caminho aninhado", () => {
    expect(readField({ a: { b: { c: 7 } } }, "a.b.c")).toBe(7);
  });
  it("devolve undefined sem lançar em caminho inexistente", () => {
    expect(readField({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(readField(null, "a")).toBeUndefined();
    expect(readField({}, "")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const profile = { stage: "Proposta", score: "42", email: "a@b.com", tags: null };

  it("compara texto de forma insensível a caixa e espaços", () => {
    expect(evaluateCondition({ field: "stage", op: "eq", value: " proposta " }, profile)).toBe(
      true,
    );
    expect(evaluateCondition({ field: "stage", op: "neq", value: "perdido" }, profile)).toBe(true);
    expect(evaluateCondition({ field: "stage", op: "contains", value: "prop" }, profile)).toBe(
      true,
    );
    expect(evaluateCondition({ field: "stage", op: "not_contains", value: "xyz" }, profile)).toBe(
      true,
    );
  });

  it("compara números vindos como string", () => {
    expect(evaluateCondition({ field: "score", op: "gte", value: 42 }, profile)).toBe(true);
    expect(evaluateCondition({ field: "score", op: "gt", value: 42 }, profile)).toBe(false);
    expect(evaluateCondition({ field: "score", op: "lt", value: 50 }, profile)).toBe(true);
    expect(evaluateCondition({ field: "score", op: "lte", value: 42 }, profile)).toBe(true);
  });

  it("é falsa (nunca lança) quando o dado numérico está ausente", () => {
    expect(evaluateCondition({ field: "inexistente", op: "gt", value: 1 }, profile)).toBe(false);
  });

  it("trata exists/not_exists incluindo string vazia e null", () => {
    expect(evaluateCondition({ field: "email", op: "exists" }, profile)).toBe(true);
    expect(evaluateCondition({ field: "tags", op: "exists" }, profile)).toBe(false);
    expect(evaluateCondition({ field: "tags", op: "not_exists" }, profile)).toBe(true);
  });

  it("suporta in com lista", () => {
    expect(
      evaluateCondition({ field: "stage", op: "in", value: ["Ganho", "Proposta"] }, profile),
    ).toBe(true);
    expect(evaluateCondition({ field: "stage", op: "in", value: "Proposta" }, profile)).toBe(false);
  });

  it("operador desconhecido é falso", () => {
    expect(evaluateCondition({ field: "stage", op: "wat" as never }, profile)).toBe(false);
  });
});

describe("evaluateConditionGroup", () => {
  const profile = { a: "1", b: "2" };
  it("grupo vazio não bloqueia", () => {
    expect(evaluateConditionGroup([], "all", profile)).toBe(true);
  });
  it("all exige todas", () => {
    expect(
      evaluateConditionGroup(
        [
          { field: "a", op: "eq", value: 1 },
          { field: "b", op: "eq", value: 9 },
        ],
        "all",
        profile,
      ),
    ).toBe(false);
  });
  it("any exige uma", () => {
    expect(
      evaluateConditionGroup(
        [
          { field: "a", op: "eq", value: 1 },
          { field: "b", op: "eq", value: 9 },
        ],
        "any",
        profile,
      ),
    ).toBe(true);
  });
});

describe("parseConditions", () => {
  it("descarta itens malformados sem derrubar o fluxo", () => {
    expect(
      parseConditions([null, 3, { op: "eq" }, { field: " stage ", op: " eq ", value: "x" }]),
    ).toEqual([{ field: "stage", op: "eq", value: "x" }]);
  });
  it("não é array → vazio", () => {
    expect(parseConditions("nada")).toEqual([]);
  });
});

describe("waitDurationMs", () => {
  it("soma minutos, horas e dias", () => {
    expect(waitDurationMs({ delay_minutes: 30, delay_hours: 1, delay_days: 1 })).toBe(
      30 * 60_000 + 3_600_000 + 86_400_000,
    );
  });
  it("valores inválidos ou negativos viram zero", () => {
    expect(waitDurationMs({ delay_hours: "abc" })).toBe(0);
    expect(waitDurationMs({ delay_days: -5 })).toBe(0);
  });
  it("limita a 30 dias", () => {
    expect(waitDurationMs({ delay_days: 999 })).toBe(30 * 86_400_000);
  });
});

describe("clampToSendWindow", () => {
  it("janela 0-24 não altera nada", () => {
    expect(clampToSendWindow(NOW, 0, 24)).toBe(NOW);
  });
  it("dentro da janela mantém o instante", () => {
    expect(clampToSendWindow(NOW, 9, 19)).toBe(NOW);
  });
  it("antes da abertura adia para o início do mesmo dia", () => {
    const early = Date.parse("2026-07-26T06:00:00.000Z");
    expect(new Date(clampToSendWindow(early, 9, 19)).toISOString()).toBe(
      "2026-07-26T09:00:00.000Z",
    );
  });
  it("depois do fechamento adia para o dia seguinte", () => {
    const late = Date.parse("2026-07-26T21:30:00.000Z");
    expect(new Date(clampToSendWindow(late, 9, 19)).toISOString()).toBe("2026-07-27T09:00:00.000Z");
  });
  it("janela invertida é fail-open", () => {
    expect(clampToSendWindow(NOW, 20, 8)).toBe(NOW);
  });
});

describe("pickSplitBranch", () => {
  const branches = [
    { branch: "A", weight: 50 },
    { branch: "B", weight: 50 },
  ];
  it("é determinístico para a mesma semente", () => {
    expect(pickSplitBranch(branches, "abc")).toBe(pickSplitBranch(branches, "abc"));
  });
  it("distribui aproximadamente conforme os pesos", () => {
    let a = 0;
    for (let i = 0; i < 2000; i++) if (pickSplitBranch(branches, `seed-${i}`) === "A") a++;
    expect(a).toBeGreaterThan(800);
    expect(a).toBeLessThan(1200);
  });
  it("peso 100/0 sempre cai no ramo com peso", () => {
    const only = [
      { branch: "A", weight: 100 },
      { branch: "B", weight: 0 },
    ];
    for (let i = 0; i < 50; i++) expect(pickSplitBranch(only, `s${i}`)).toBe("A");
  });
  it("sem pesos válidos devolve o primeiro ramo ou null", () => {
    expect(pickSplitBranch([{ branch: "A", weight: 0 }], "x")).toBe("A");
    expect(pickSplitBranch([], "x")).toBeNull();
  });
});

describe("parseSplitBranches", () => {
  it("tolera JSON malformado", () => {
    expect(parseSplitBranches([{ branch: "A", weight: "60" }, {}, null])).toEqual([
      { branch: "A", weight: 60 },
    ]);
  });
});

describe("findEdge", () => {
  const edges: JourneyEdge[] = [
    { from_node_id: "n1", to_node_id: "n3", branch: "false", ordinal: 1 },
    { from_node_id: "n1", to_node_id: "n2", branch: "true", ordinal: 0 },
  ];
  it("encontra pelo ramo", () => {
    expect(findEdge(edges, "n1", "true")?.to_node_id).toBe("n2");
  });
  it("default cai na primeira aresta por ordinal", () => {
    expect(findEdge(edges, "n1", "default")?.to_node_id).toBe("n2");
  });
  it("ramo inexistente não faz fallback", () => {
    expect(findEdge(edges, "n1", "C")).toBeNull();
  });
});

describe("decideJourneyAction", () => {
  it("gatilho avança para o próximo nó", () => {
    const d = decideJourneyAction(
      facts({
        node: node({ id: "t", kind: "trigger" }),
        edges: [{ from_node_id: "t", to_node_id: "s", branch: "default" }],
      }),
    );
    expect(d).toEqual({ action: "advance", toNodeId: "s", branch: "default" });
  });

  it("gatilho sem saída falha", () => {
    const d = decideJourneyAction(facts({ node: node({ id: "t", kind: "trigger" }) }));
    expect(d.action).toBe("fail");
  });

  it("espera agenda o retorno respeitando a janela", () => {
    const d = decideJourneyAction(
      facts({
        node: node({ id: "w", kind: "wait", config: { delay_hours: 12 } }),
        edges: [{ from_node_id: "w", to_node_id: "s", branch: "default" }],
        sendWindowStart: 9,
        sendWindowEnd: 19,
      }),
    );
    expect(d).toEqual({
      action: "wait",
      toNodeId: "s",
      resumeAt: "2026-07-27T09:00:00.000Z",
    });
  });

  it("condição verdadeira segue o ramo true", () => {
    const d = decideJourneyAction(
      facts({
        node: node({
          id: "c",
          kind: "condition",
          config: { conditions: [{ field: "stage", op: "eq", value: "ganho" }] },
        }),
        profile: { stage: "Ganho" },
        edges: [
          { from_node_id: "c", to_node_id: "yes", branch: "true" },
          { from_node_id: "c", to_node_id: "no", branch: "false" },
        ],
      }),
    );
    expect(d).toEqual({ action: "advance", toNodeId: "yes", branch: "true" });
  });

  it("condição sem o ramo necessário encerra a jornada", () => {
    const d = decideJourneyAction(
      facts({
        node: node({
          id: "c",
          kind: "condition",
          config: { conditions: [{ field: "stage", op: "eq", value: "perdido" }] },
        }),
        profile: { stage: "Ganho" },
        edges: [{ from_node_id: "c", to_node_id: "yes", branch: "true" }],
      }),
    );
    expect(d.action).toBe("exit");
  });

  it("split escolhe ramo determinístico", () => {
    const build = (seed: string) =>
      decideJourneyAction(
        facts({
          seed,
          node: node({
            id: "sp",
            kind: "split",
            config: {
              branches: [
                { branch: "A", weight: 100 },
                { branch: "B", weight: 0 },
              ],
            },
          }),
          edges: [
            { from_node_id: "sp", to_node_id: "na", branch: "A" },
            { from_node_id: "sp", to_node_id: "nb", branch: "B" },
          ],
        }),
      );
    expect(build("x")).toEqual({ action: "advance", toNodeId: "na", branch: "A" });
    expect(build("y")).toEqual({ action: "advance", toNodeId: "na", branch: "A" });
  });

  it("meta e saída são terminais", () => {
    expect(decideJourneyAction(facts({ node: node({ id: "g", kind: "goal" }) })).action).toBe(
      "goal_reached",
    );
    expect(decideJourneyAction(facts({ node: node({ id: "e", kind: "exit" }) })).action).toBe(
      "exit",
    );
  });

  const sendNode = node({ id: "s", kind: "send", config: { channel: "Email", template_id: "t1" } });
  const sendEdges: JourneyEdge[] = [{ from_node_id: "s", to_node_id: "g", branch: "default" }];

  it("envio sem canal falha", () => {
    const d = decideJourneyAction(
      facts({ node: node({ id: "s", kind: "send" }), edges: sendEdges }),
    );
    expect(d.action).toBe("fail");
  });

  it("opt-out encerra a jornada (LGPD)", () => {
    const d = decideJourneyAction(
      facts({ node: sendNode, edges: sendEdges, consentAllowed: false }),
    );
    expect(d).toMatchObject({ action: "exit" });
  });

  it("consentimento indeterminado permite o envio (fail-open igual ao check_consent)", () => {
    const d = decideJourneyAction(
      facts({ node: sendNode, edges: sendEdges, consentAllowed: null }),
    );
    expect(d).toMatchObject({ action: "send", channel: "email", nextNodeId: "g" });
  });

  it("fora da janela adia até a abertura, antes de olhar orçamento", () => {
    const d = decideJourneyAction(
      facts({
        node: sendNode,
        edges: sendEdges,
        sendWindowStart: 9,
        sendWindowEnd: 11,
        budgetBlocked: true,
      }),
    );
    expect(d).toMatchObject({ action: "defer", resumeAt: "2026-07-27T09:00:00.000Z" });
  });

  it("orçamento esgotado adia 1h e nunca encerra", () => {
    const d = decideJourneyAction(
      facts({ node: sendNode, edges: sendEdges, budgetBlocked: true, budgetReason: "teto diário" }),
    );
    expect(d).toMatchObject({
      action: "defer",
      resumeAt: new Date(NOW + BUDGET_DEFER_MS).toISOString(),
    });
  });

  it("gate humano tem precedência sobre o envio", () => {
    const d = decideJourneyAction(
      facts({ node: sendNode, edges: sendEdges, requiresHumanApproval: true }),
    );
    expect(d).toMatchObject({ action: "approval_gate", channel: "email" });
  });

  it("opt-out vence o gate humano", () => {
    const d = decideJourneyAction(
      facts({
        node: sendNode,
        edges: sendEdges,
        requiresHumanApproval: true,
        consentAllowed: false,
      }),
    );
    expect(d.action).toBe("exit");
  });

  it("envio sem próxima etapa devolve nextNodeId null", () => {
    const d = decideJourneyAction(facts({ node: sendNode }));
    expect(d).toMatchObject({ action: "send", nextNodeId: null });
  });

  it("tipo desconhecido falha em vez de lançar", () => {
    const d = decideJourneyAction(facts({ node: node({ id: "x", kind: "wat" as never }) }));
    expect(d.action).toBe("fail");
  });
});

describe("findWaitlessCycle", () => {
  it("detecta ciclo sem espera", () => {
    const nodes = [node({ id: "a", kind: "condition" }), node({ id: "b", kind: "condition" })];
    const edges: JourneyEdge[] = [
      { from_node_id: "a", to_node_id: "b", branch: "true" },
      { from_node_id: "b", to_node_id: "a", branch: "true" },
    ];
    expect(findWaitlessCycle(nodes, edges)).toBe(true);
  });

  it("ciclo com etapa de espera é permitido", () => {
    const nodes = [node({ id: "a", kind: "condition" }), node({ id: "w", kind: "wait" })];
    const edges: JourneyEdge[] = [
      { from_node_id: "a", to_node_id: "w", branch: "true" },
      { from_node_id: "w", to_node_id: "a", branch: "default" },
    ];
    expect(findWaitlessCycle(nodes, edges)).toBe(false);
  });
});

describe("validateJourney", () => {
  const valid = () => ({
    nodes: [
      node({ id: "t", kind: "trigger", label: "Entrada" }),
      node({
        id: "s",
        kind: "send",
        label: "E-mail 1",
        config: { channel: "email", template_id: "tpl-1" },
      }),
      node({ id: "g", kind: "goal", label: "Reunião marcada" }),
    ],
    edges: [
      { from_node_id: "t", to_node_id: "s", branch: "default" },
      { from_node_id: "s", to_node_id: "g", branch: "default" },
    ] as JourneyEdge[],
  });

  it("jornada bem formada não tem erros", () => {
    const { nodes, edges } = valid();
    expect(validateJourney(nodes, edges).filter((i) => i.level === "error")).toEqual([]);
  });

  it("exige exatamente um gatilho", () => {
    const { nodes, edges } = valid();
    expect(validateJourney(nodes.slice(1), edges).some((i) => i.level === "error")).toBe(true);
    const two = [...nodes, node({ id: "t2", kind: "trigger" })];
    expect(validateJourney(two, edges).some((i) => i.message.includes("um gatilho"))).toBe(true);
  });

  it("aponta etapa sem saída e etapa de envio sem canal", () => {
    const nodes = [node({ id: "t", kind: "trigger" }), node({ id: "s", kind: "send" })];
    const issues = validateJourney(nodes, [
      { from_node_id: "t", to_node_id: "s", branch: "default" },
    ]);
    expect(issues.some((i) => i.message.includes("não tem saída"))).toBe(true);
    expect(issues.some((i) => i.message.includes("sem canal"))).toBe(true);
  });

  it("avisa sobre etapa desconectada e espera de duração zero", () => {
    const { nodes, edges } = valid();
    const withOrphan = [...nodes, node({ id: "w", kind: "wait", label: "Pausa" })];
    const withEdge = [
      ...edges,
      { from_node_id: "w", to_node_id: "g", branch: "default" } as JourneyEdge,
    ];
    const issues = validateJourney(withOrphan, withEdge);
    expect(issues.some((i) => i.message.includes("desconectada"))).toBe(true);
    expect(issues.some((i) => i.message.includes("duração zero"))).toBe(true);
  });

  it("exige conteúdo ou template na etapa de envio", () => {
    const { nodes, edges } = valid();
    const semConteudo = nodes.map((n) =>
      n.id === "s" ? { ...n, config: { channel: "email" } } : n,
    );
    expect(
      validateJourney(semConteudo, edges).some((i) =>
        i.message.includes("não tem mensagem nem template"),
      ),
    ).toBe(true);
  });

  it("aplica o pré-voo de entregabilidade em e-mail escrito no nó", () => {
    const { nodes, edges } = valid();
    const inline = nodes.map((n) =>
      n.id === "s"
        ? { ...n, config: { channel: "email", subject: "Oferta", body: "Clique aqui" } }
        : n,
    );
    const issues = validateJourney(inline, edges);
    expect(issues.some((i) => i.level === "error" && i.message.includes("Entregabilidade"))).toBe(
      true,
    );
  });

  it("aponta ligação para etapa inexistente", () => {
    const { nodes, edges } = valid();
    const issues = validateJourney(nodes, [
      ...edges,
      { from_node_id: "s", to_node_id: "zzz", branch: "x" },
    ]);
    expect(issues.some((i) => i.message.includes("inexistente"))).toBe(true);
  });

  it("bloqueia ciclo sem espera", () => {
    const nodes = [
      node({ id: "t", kind: "trigger" }),
      node({ id: "s", kind: "send", config: { channel: "email" } }),
    ];
    const edges: JourneyEdge[] = [
      { from_node_id: "t", to_node_id: "s", branch: "default" },
      { from_node_id: "s", to_node_id: "t", branch: "default" },
    ];
    expect(validateJourney(nodes, edges).some((i) => i.message.includes("laço infinito"))).toBe(
      true,
    );
  });
});
