import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Busca scores de churn para o dashboard.
 */
export const getChurnRiskOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_churn_scores")
      .select(
        `
        *,
        contact:campaign_targets(first_name, last_name, email, company_name)
      `,
      )
      .order("risk_score", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Agregados de churn para o widget do dashboard.
 */
export const getChurnMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_churn_scores")
      .select("risk_level");

    if (error) throw new Error(error.message);

    const metrics = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    data.forEach((row) => {
      const level = row.risk_level as keyof typeof metrics;
      if (level in metrics) metrics[level]++;
    });

    return metrics;
  });
