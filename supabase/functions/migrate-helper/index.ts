// Edge function temporária para migração de banco.
// Cole em: Cloud > Edge Functions > migrate-helper > View code
// Após a migração, remova esta função.

const ACCESS_KEY = "6ca1b67f5d6ee5b36b3259938e0720b600aba67e5e1f3663";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-access-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const key = req.headers.get("x-access-key");
  if (key !== ACCESS_KEY) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ping";

  try {
    if (action === "ping") {
      return new Response(JSON.stringify({ ok: true, project_ref: Deno.env.get("SUPABASE_URL") }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (action === "credentials") {
      return new Response(JSON.stringify({
        url: Deno.env.get("SUPABASE_URL"),
        service_role: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        db_url: Deno.env.get("SUPABASE_DB_URL"),
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});