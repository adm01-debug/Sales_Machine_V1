/**
 * Runtime config for external systems (LUX, SINGU, FATOR X) that the
 * SALES MACHINE orchestrates. All values are pulled from process.env at
 * request time — never at module scope — so missing secrets fail loudly
 * only on the endpoints that need them.
 */
export type ExternalSystem = "lux" | "singu" | "fatorx";

export function getExternalConfig(system: ExternalSystem) {
  switch (system) {
    case "lux":
      return {
        baseUrl: process.env.LUX_URL ?? "",
        serviceKey: process.env.LUX_SERVICE_KEY ?? "",
        webhookSecret: process.env.LUX_WEBHOOK_SECRET ?? "",
      };
    case "singu":
      return {
        baseUrl: process.env.SINGU_URL ?? "",
        serviceKey: process.env.SINGU_SERVICE_KEY ?? "",
        webhookSecret: process.env.SINGU_WEBHOOK_SECRET ?? "",
      };
    case "fatorx":
      return {
        baseUrl: process.env.FATORX_URL ?? "",
        serviceKey: process.env.FATORX_SERVICE_KEY ?? "",
        webhookSecret: process.env.FATORX_WEBHOOK_SECRET ?? "",
        defaultAgentId: process.env.FATORX_AGENT_ID_DEFAULT ?? "",
      };
  }
}

export function assertConfigured(system: ExternalSystem): void {
  const cfg = getExternalConfig(system);
  if (!cfg.baseUrl) {
    throw new Error(
      `${system.toUpperCase()}_URL not configured. Add it in project secrets.`,
    );
  }
}