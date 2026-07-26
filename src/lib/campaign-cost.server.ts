/**
 * Serviço server-only do pré-voo de custo: junta o tamanho real da audiência,
 * as variantes salvas e o guardrail de orçamento do canal.
 *
 * Fica separado de `marketing.functions.ts` porque o split de server functions
 * remove os irmãos de módulo do bundle do servidor.
 */
import { estimateCampaignCost, evaluateCostPreflight, type CostPreflight } from "@/lib/campaign-cost";
import { buildBudgetReport } from "@/lib/budget.server";

type Client = {
  from: (table: string) => any;
};

/**
 * Monta o pré-voo de uma campanha. Nunca lança por indisponibilidade do
 * orçamento: sem guardrail apurável o veredito cai para o caminho fail-open
 * (`ok`), coerente com o worker de cadência.
 */
export async function buildCampaignPreflight(
  client: Client,
  campaignId: string,
): Promise<CostPreflight & { campaignId: string; budgetAvailable: boolean }> {
  const { data: campaign, error } = await client
    .from("marketing_campaigns")
    .select("id, channel, audience_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("Campanha não encontrada");

  const { data: variants } = await client
    .from("campaign_variants")
    .select("label, body, split_percent")
    .eq("campaign_id", campaignId)
    .order("label");

  let audienceSize = 0;
  if (campaign.audience_id) {
    const { count } = await client
      .from("audience_members")
      .select("entity_id", { count: "exact", head: true })
      .eq("audience_id", campaign.audience_id);
    audienceSize = Number(count) || 0;
  }

  const estimate = estimateCampaignCost({
    channel: String(campaign.channel),
    audienceSize,
    variants: (variants ?? []).map((v: any) => ({
      label: String(v.label),
      body: String(v.body ?? ""),
      split_percent: Number(v.split_percent) || 0,
    })),
  });

  let budgetState = null;
  let budgetAvailable = false;
  try {
    const report = await buildBudgetReport(client as never);
    budgetState = report.states.find((s) => s.channel === campaign.channel) ?? null;
    budgetAvailable = true;
  } catch (err) {
    console.error("[preflight] orçamento indisponível — seguindo em fail-open", err);
  }

  return {
    ...evaluateCostPreflight(estimate, budgetState),
    campaignId,
    budgetAvailable,
  };
}