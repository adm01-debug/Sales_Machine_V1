import { createFileRoute } from "@tanstack/react-router";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token.server";

/**
 * Public LGPD-compliant unsubscribe endpoint.
 * GET renders confirmation page; POST records opt_out in consent_ledger.
 * Token = base64url(payload).hmac  (see unsubscribe-token.server.ts).
 */

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#111;background:#fafafa}h1{font-size:20px}button{background:#111;color:#fff;border:0;padding:12px 20px;border-radius:6px;cursor:pointer;font-size:15px}p{line-height:1.5;color:#444}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return page("Link inválido", "<h1>Link inválido ou expirado</h1><p>Este link de descadastro não é mais válido. Se quiser parar de receber mensagens, responda com PARE na conversa original.</p>", 400);

  if (request.method === "POST") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("consent_ledger").insert({
      entity_id: parsed.entityId,
      channel: parsed.channel as never,
      status: "opt_out",
      source: "unsubscribe_link",
      reason: "user clicked unsubscribe link",
      evidence: { ua: request.headers.get("user-agent") ?? null } as never,
    });
    return page("Descadastrado", `<h1>Pronto ✅</h1><p>Você não receberá mais mensagens de <b>${parsed.channel}</b>. Se mudar de ideia, é só responder à conversa original.</p>`);
  }

  return page(
    "Confirmar descadastro",
    `<h1>Descadastrar de ${parsed.channel}</h1><p>Clique abaixo para confirmar que não deseja mais receber mensagens nossas por este canal.</p><form method="POST"><button type="submit">Descadastrar agora</button></form>`,
  );
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});