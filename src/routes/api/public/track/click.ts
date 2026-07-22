import { createFileRoute } from "@tanstack/react-router";

/** Click-tracking proxy: /api/public/track/click?tp=<touchpoint>&url=<target> */
export const Route = createFileRoute("/api/public/track/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const tp = u.searchParams.get("tp");
        const target = u.searchParams.get("url");
        if (!target) return new Response("missing url", { status: 400 });
        // Only allow absolute http(s) URLs to avoid open-redirect abuse
        let dest: URL;
        try {
          dest = new URL(target);
          if (dest.protocol !== "http:" && dest.protocol !== "https:") throw new Error("bad protocol");
        } catch {
          return new Response("invalid url", { status: 400 });
        }
        if (tp) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: touchpoint } = await supabaseAdmin
              .from("contact_touchpoints").select("entity_id").eq("id", tp).maybeSingle();
            await supabaseAdmin.from("email_deliverability_events").insert({
              touchpoint_id: tp,
              entity_id: touchpoint?.entity_id ?? null,
              event_type: "clicked",
              provider: "tracking_link",
              raw: { url: dest.toString(), ua: request.headers.get("user-agent") ?? null } as never,
            });
            await supabaseAdmin.from("sales_machine_events").insert({
              source: "singu",
              event_type: "click",
              payload: { touchpoint_id: tp, url: dest.toString(), entity_id: touchpoint?.entity_id ?? null } as never,
            });
          } catch (e) {
            console.error("[track/click] failed", e);
          }
        }
        return Response.redirect(dest.toString(), 302);
      },
    },
  },
});