import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkEmailDns, getFuxicoStatus } from "@/lib/deliverability.functions";

export const Route = createFileRoute("/_authenticated/deliverability")({
  head: () => ({
    meta: [
      { title: "Deliverability · SALES MACHINE" },
      { name: "description", content: "Verifique SPF, DKIM e DMARC do seu domínio de envio." },
    ],
  }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado.</div>,
});

function Row({ label, ok, value, extra }: { label: string; ok: boolean; value: string | null; extra?: string | null }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium text-foreground">{label}</div>
        <span className={ok ? "text-xs font-semibold text-primary" : "text-xs font-semibold text-destructive"}>
          {ok ? "OK" : "AUSENTE"}
        </span>
      </div>
      {value ? <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs text-muted-foreground">{value}</pre> : null}
      {extra ? <p className="mt-2 text-xs text-muted-foreground">{extra}</p> : null}
    </div>
  );
}

function Page() {
  const [domain, setDomain] = useState("");
  const fn = useServerFn(checkEmailDns);
  const check = useMutation({ mutationFn: (d: string) => fn({ data: { domain: d } }) });
  const statusFn = useServerFn(getFuxicoStatus);
  const fuxico = useQuery({ queryKey: ["fuxico-status"], queryFn: () => statusFn({}) });

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Deliverability de E-mail</h1>
          <p className="text-sm text-muted-foreground">Verifique SPF, DKIM e DMARC do seu domínio.</p>
        </div>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">← Dashboard</Link>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); if (domain.trim()) check.mutate(domain.trim()); }}
        className="flex gap-2"
      >
        <Input placeholder="exemplo.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <Button type="submit" disabled={check.isPending}>{check.isPending ? "Verificando..." : "Verificar"}</Button>
      </form>

      {check.data ? (
        <div className="space-y-3">
          <Row label="SPF" ok={check.data.spf.found} value={check.data.spf.value}
            extra={check.data.spf.found ? (check.data.spf.strict ? "Política estrita (-all/~all)." : "Encontrado, mas política permissiva.") : "Sem SPF: e-mails podem ir para spam."} />
          <Row label="DKIM" ok={check.data.dkim.found} value={check.data.dkim.value} extra={check.data.dkim.note} />
          <Row label={`DMARC ${check.data.dmarc.policy ? `(p=${check.data.dmarc.policy})` : ""}`} ok={check.data.dmarc.found} value={check.data.dmarc.value}
            extra={check.data.dmarc.found ? "Recomendado: p=quarantine ou reject com rua=." : "Sem DMARC: sem proteção contra spoofing."} />
        </div>
      ) : null}

      <FuxicoSection data={fuxico.data} loading={fuxico.isPending} />
    </div>
  );
}

function FuxicoSection({
  data,
  loading,
}: {
  data: Awaited<ReturnType<typeof getFuxicoStatus>> | undefined;
  loading: boolean;
}) {
  const webhookUrl =
    typeof window === "undefined"
      ? "/api/public/webhooks/fuxico"
      : `${window.location.origin}/api/public/webhooks/fuxico`;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">FUXICO — Tracking de e-mail</h2>
        {loading ? (
          <span className="text-xs text-muted-foreground">carregando…</span>
        ) : (
          <span
            className={
              data?.configured
                ? "text-xs font-semibold text-primary"
                : "text-xs font-semibold text-destructive"
            }
          >
            {data?.configured ? "CONECTADO" : "NÃO CONFIGURADO"}
          </span>
        )}
      </div>

      {!loading && !data?.configured ? (
        <p className="text-sm text-muted-foreground">
          Configure os segredos <code className="rounded bg-muted px-1">FUXICO_URL</code>,{" "}
          <code className="rounded bg-muted px-1">FUXICO_SERVICE_KEY</code> e{" "}
          <code className="rounded bg-muted px-1">FUXICO_WEBHOOK_SECRET</code> para ativar aberturas e
          cliques. Enquanto isso, os envios continuam usando o pixel interno.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(
          [
            ["Aberturas", data?.counts.opened],
            ["Cliques", data?.counts.clicked],
            ["Bounces", data?.counts.hard_bounce],
            ["Reclamações", data?.counts.complaint],
            ["Descadastros", data?.counts.unsubscribe],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold text-foreground">{value ?? 0}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Eventos dos últimos 30 dias recebidos do FUXICO.</p>

      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-foreground">URL de webhook para cadastrar no FUXICO</p>
        <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs text-muted-foreground">
          {webhookUrl}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Use o mesmo segredo salvo em FUXICO_WEBHOOK_SECRET no campo &quot;secret&quot; do webhook{" "}
          {data && !data.webhookSecretSet ? "(ainda não configurado aqui)" : ""}.
        </p>
      </div>
    </section>
  );
}