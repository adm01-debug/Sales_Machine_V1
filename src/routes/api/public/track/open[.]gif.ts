import { createFileRoute } from "@tanstack/react-router";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function logOpen(request: Request) {
  const url = new URL(request.url);
  const tp = url.searchParams.get("tp");
  if (!tp) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: touchpoint } = await supabaseAdmin
      .from("contact_touchpoints")
      .select("entity_id")
      .eq("id", tp)
      .maybeSingle();
    await supabaseAdmin.from("email_deliverability_events").insert({
      touchpoint_id: tp,
      entity_id: touchpoint?.entity_id ?? null,
      event_type: "opened",
      provider: "tracking_pixel",
      raw: { ua: request.headers.get("user-agent") ?? null } as never,
    });
    await supabaseAdmin.from("sales_machine_events").insert({
      source: "singu",
      event_type: "open",
      payload: { touchpoint_id: tp, entity_id: touchpoint?.entity_id ?? null } as never,
    });
  } catch (e) {
    console.error("[track/open] failed", e);
  }
}

export const Route = createFileRoute("/api/public/track/open.gif")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await logOpen(request);
        return new Response(PIXEL, {
          status: 200,
          headers: {
            "content-type": "image/gif",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      },
    },
  },
});
