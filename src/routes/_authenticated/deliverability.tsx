import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkEmailDns,
  getFuxicoStatus,
  getFuxicoConfig,
  testFuxicoConnection,
  runFuxicoEmailTest,
  sendTestFuxicoWebhook,
  getCampaignDeliverabilityReport,
  getTrackingIntegrityReport,
} from "@/lib/deliverability.functions";

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

function Row({
  label,
  ok,
  value,
  extra,
}: {
  label: string;
  ok: boolean;
  value: string | null;
  extra?: string | null;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium text-foreground">{label}</div>
        <span
          className={
            ok ? "text-xs font-semibold text-primary" : "text-xs font-semibold text-destructive"
          }
        >
          {ok ? "OK" : "AUSENTE"}
        </span>
      </div>
      {value ? (
        <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs text-muted-foreground">
          {value}
        </pre>
      ) : null}
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
          <p className="text-sm text-muted-foreground">
            Verifique SPF, DKIM e DMARC do seu domínio.
          </p>
        </div>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">
          ← Dashboard
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (domain.trim()) check.mutate(domain.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="exemplo.com.br"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <Button type="submit" disabled={check.isPending}>
          {check.isPending ? "Verificando..." : "Verificar"}
        </Button>
      </form>

      {check.data ? (
        <div className="space-y-3">
          <Row
            label="SPF"
            ok={check.data.spf.found}
            value={check.data.spf.value}
            extra={
              check.data.spf.found
                ? check.data.spf.strict
                  ? "Política estrita (-all/~all)."
                  : "Encontrado, mas política permissiva."
                : "Sem SPF: e-mails podem ir para spam."
            }
          />
          <Row
            label="DKIM"
            ok={check.data.dkim.found}
            value={check.data.dkim.value}
            extra={check.data.dkim.note}
          />
          <Row
            label={`DMARC ${check.data.dmarc.policy ? `(p=${check.data.dmarc.policy})` : ""}`}
            ok={check.data.dmarc.found}
            value={check.data.dmarc.value}
            extra={
              check.data.dmarc.found
                ? "Recomendado: p=quarantine ou reject com rua=."
                : "Sem DMARC: sem proteção contra spoofing."
            }
          />
        </div>
      ) : null}

      <FuxicoSection data={fuxico.data} loading={fuxico.isPending} />
      <FuxicoConfigSection />
      <FuxicoE2ESection />
      <FuxicoWebhookTestSection />
      <CampaignReportSection />

      <TrackingIntegritySection />
    </div>
  );
}

function SecretRow({
  name,
  ok,
  hint,
  value,
}: {
  name: string;
  ok: boolean;
  hint: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="min-w-0">
        <code className="rounded bg-muted px-1 text-sm text-foreground">{name}</code>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        {value ? <p className="mt-1 truncate text-xs text-muted-foreground">{value}</p> : null}
      </div>
      <span
        className={
          ok
            ? "shrink-0 text-xs font-semibold text-primary"
            : "shrink-0 text-xs font-semibold text-destructive"
        }
      >
        {ok ? "CONFIGURADO" : "PENDENTE"}
      </span>
    </div>
  );
}

function FuxicoConfigSection() {
  const cfgFn = useServerFn(getFuxicoConfig);
  const cfg = useQuery({ queryKey: ["fuxico-config"], queryFn: () => cfgFn({}) });
  const testFn = useServerFn(testFuxicoConnection);
  const test = useMutation({ mutationFn: () => testFn({}) });

  const allSet = !!cfg.data?.url.set && !!cfg.data?.serviceKey.set && !!cfg.data?.webhookSecret.set;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Configuração da conexão FUXICO</h2>
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? "Testando..." : "Testar conexão"}
        </Button>
      </div>

      {cfg.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando status dos segredos…</p>
      ) : (
        <div className="space-y-2">
          <SecretRow
            name="FUXICO_URL"
            ok={!!cfg.data?.url.set && !!cfg.data?.url.valid}
            hint="URL base do FUXICO (https). Ex.: https://open-receipt-ace.lovable.app"
            value={
              cfg.data?.url.set && !cfg.data?.url.valid
                ? "Valor inválido: precisa ser uma URL https completa."
                : cfg.data?.url.preview
            }
          />
          <SecretRow
            name="FUXICO_SERVICE_KEY"
            ok={!!cfg.data?.serviceKey.set}
            hint="Chave de serviço usada para autenticar as chamadas de criação de rastreio."
          />
          <SecretRow
            name="FUXICO_WEBHOOK_SECRET"
            ok={!!cfg.data?.webhookSecret.set}
            hint="Segredo HMAC usado para validar os webhooks recebidos do FUXICO."
          />
        </div>
      )}

      {test.data ? (
        <div
          className={
            test.data.ok
              ? "rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm text-foreground"
              : "rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground"
          }
        >
          {test.data.ok ? "✅ " : "⚠️ "}
          {test.data.message}
        </div>
      ) : null}

      {!cfg.isPending && !allSet ? (
        <p className="text-xs text-muted-foreground">
          Os valores são gravados como segredos do backend (nunca ficam no código nem aparecem nesta
          tela). Peça no chat para cadastrar os segredos pendentes e um formulário seguro será
          aberto.
        </p>
      ) : null}
    </section>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          ok ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"
        }
      >
        {ok ? "OK" : "NÃO"}
      </p>
    </div>
  );
}

function FuxicoE2ESection() {
  return <FuxicoE2ESectionInner />;
}

function FuxicoWebhookTestSection() {
  return <FuxicoWebhookTestSectionInner />;
}

const PERIODS = [7, 30, 90] as const;

function CampaignReportSection() {
  const [days, setDays] = useState<number>(30);
  const reportFn = useServerFn(getCampaignDeliverabilityReport);
  const report = useQuery({
    queryKey: ["fuxico-campaign-report", days],
    queryFn: () => reportFn({ data: { days } }),
  });

  const exportCsv = () => {
    const rows = report.data?.rows ?? [];
    const header = [
      "campanha",
      "campaign_id",
      "envios",
      "aberturas",
      "cliques",
      "bounces",
      "reclamacoes",
      "descadastros",
      "taxa_abertura_%",
      "taxa_clique_%",
      "taxa_bounce_%",
    ];
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          esc(r.campaignName),
          esc(r.campaignId),
          r.sends,
          r.opened,
          r.clicked,
          r.hardBounce,
          r.complaint,
          r.unsubscribe,
          r.openRate,
          r.clickRate,
          r.bounceRate,
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `deliverability-campanhas-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Relatório por campanha</h2>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={days === p ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(p)}
            >
              {p}d
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!rows.length}
          >
            Exportar CSV
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Aberturas, cliques, bounces e reclamações recebidos do FUXICO, agregados pela campanha do
        touchpoint de e-mail.
      </p>

      {report.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : report.error ? (
        <p className="text-sm text-destructive">{(report.error as Error).message}</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum envio de e-mail registrado nos últimos {days} dias.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Campanha</th>
                <th className="px-3 py-2 text-right">Envios</th>
                <th className="px-3 py-2 text-right">Aberturas</th>
                <th className="px-3 py-2 text-right">Cliques</th>
                <th className="px-3 py-2 text-right">Bounces</th>
                <th className="px-3 py-2 text-right">Reclam.</th>
                <th className="px-3 py-2 text-right">Descad.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.campaignId ?? "none"} className="border-b last:border-0">
                  <td className="px-3 py-2 text-foreground">{r.campaignName}</td>
                  <td className="px-3 py-2 text-right text-foreground">{r.sends}</td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {r.opened}{" "}
                    <span className="text-xs text-muted-foreground">({r.openRate}%)</span>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {r.clicked}{" "}
                    <span className="text-xs text-muted-foreground">({r.clickRate}%)</span>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {r.hardBounce}{" "}
                    <span className="text-xs text-muted-foreground">({r.bounceRate}%)</span>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{r.complaint}</td>
                  <td className="px-3 py-2 text-right text-foreground">{r.unsubscribe}</td>
                </tr>
              ))}
              {totals ? (
                <tr className="bg-muted/30 font-medium">
                  <td className="px-3 py-2 text-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.sends}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.opened}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.clicked}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.hardBounce}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.complaint}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totals.unsubscribe}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  ok: "border-primary/30 bg-primary/5 text-primary",
  warning: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber",
  error: "border-destructive/40 bg-destructive/5 text-destructive",
};

/**
 * Auditoria de duplicidade e cobertura do rastreio (fuxico_tracking_id).
 * Expõe as quatro anomalias que contaminam as métricas de e-mail.
 */
function TrackingIntegritySection() {
  const [days, setDays] = useState<number>(7);
  const fn = useServerFn(getTrackingIntegrityReport);
  const audit = useQuery({
    queryKey: ["fuxico-tracking-integrity", days],
    queryFn: () => fn({ data: { days } }),
  });

  const data = audit.data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Auditoria de rastreio</h2>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={days === p ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(p)}
            >
              {p}d
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Verifica se cada e-mail enviado tem código de rastreio único e se os eventos recebidos do
        FUXICO não foram contados duas vezes.
      </p>

      {audit.isPending ? (
        <p className="text-sm text-muted-foreground">Analisando...</p>
      ) : audit.error ? (
        <p className="text-sm text-destructive">{(audit.error as Error).message}</p>
      ) : data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Envios de e-mail</p>
              <p className="text-2xl font-semibold text-foreground">{data.sends}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Eventos recebidos</p>
              <p className="text-2xl font-semibold text-foreground">{data.events}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Cobertura de rastreio</p>
              <p className="text-2xl font-semibold text-foreground">{data.coverageRate}%</p>
            </div>
          </div>

          <ul className="space-y-2">
            {data.checks.map((c) => (
              <li
                key={c.id}
                className={cn("rounded-lg border p-3 text-sm", SEVERITY_STYLES[c.severity])}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{c.label}</span>
                  <span className="tabular-nums">
                    {c.count}
                    {c.total > 0 ? ` / ${c.total}` : ""}
                  </span>
                </div>
                {c.count > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
                ) : null}
              </li>
            ))}
          </ul>

          {data.samples.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Envio (touchpoint)</th>
                    <th className="px-3 py-2">Evento</th>
                    <th className="px-3 py-2 text-right">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {data.samples.map((s) => (
                    <tr key={`${s.touchpointId}-${s.eventType}`} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {s.touchpointId}
                      </td>
                      <td className="px-3 py-2 text-foreground">{s.eventType}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {s.occurrences}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FuxicoWebhookTestSectionInner() {
  const [trackingId, setTrackingId] = useState("");
  const [email, setEmail] = useState("");
  const [event, setEvent] = useState<"email.opened" | "email.clicked">("email.opened");
  const sendFn = useServerFn(sendTestFuxicoWebhook);
  const run = useMutation({
    mutationFn: () =>
      sendFn({ data: { event, trackingId: trackingId.trim(), recipientEmail: email.trim() } }),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Validação do webhook FUXICO</h2>
      <p className="text-sm text-muted-foreground">
        Envia um evento assinado (HMAC-SHA256) para{" "}
        <code className="rounded bg-muted px-1">/api/public/webhooks/fuxico</code> e confirma se a
        linha foi gravada em{" "}
        <code className="rounded bg-muted px-1">email_deliverability_events</code>. Use o Tracking
        ID gerado no teste acima para associar o evento a um contato real.
      </p>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (trackingId.trim()) run.mutate();
        }}
      >
        <div className="grid gap-2 md:grid-cols-3">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            value={event}
            onChange={(e) => setEvent(e.target.value as "email.opened" | "email.clicked")}
          >
            <option value="email.opened">email.opened (abertura)</option>
            <option value="email.clicked">email.clicked (clique)</option>
          </select>
          <Input
            placeholder="Tracking ID"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
          />
          <Input
            type="email"
            placeholder="E-mail do destinatário (opcional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={run.isPending || !trackingId.trim()}>
          {run.isPending ? "Enviando..." : "Enviar evento assinado"}
        </Button>
      </form>

      {run.error ? (
        <p className="text-sm text-destructive">{(run.error as Error).message}</p>
      ) : null}

      {run.data ? (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <Check
              ok={run.data.status === 200}
              label={`Webhook (HTTP ${run.data.status ?? "—"})`}
            />
            <Check ok={run.data.persisted} label="Gravado no banco" />
          </div>
          <p className={run.data.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
            {run.data.ok ? "✅ " : "⚠️ "}
            {run.data.message}
          </p>
          {run.data.externalId ? (
            <pre className="break-all rounded bg-muted p-2 text-xs text-muted-foreground">
              external_id: {run.data.externalId}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FuxicoE2ESectionInner() {
  const [email, setEmail] = useState("");
  const [contactId, setContactId] = useState("");
  const [send, setSend] = useState(false);
  const runFn = useServerFn(runFuxicoEmailTest);
  const run = useMutation({
    mutationFn: () => runFn({ data: { email: email.trim(), contactId: contactId.trim(), send } }),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Teste ponta a ponta do rastreio</h2>
      <p className="text-sm text-muted-foreground">
        Gera um e-mail de exemplo com dois links pelo mesmo pipeline dos disparos reais e mostra se
        pixel, links e trackingId foram aplicados. Marque &quot;disparar de verdade&quot; e informe
        o ID do contato para enviar via SINGU.
      </p>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) run.mutate();
        }}
      >
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            type="email"
            placeholder="destinatario@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="ID do contato (opcional, para envio real)"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
            Disparar de verdade via SINGU
          </label>
          <Button type="submit" disabled={run.isPending || !email.trim()}>
            {run.isPending ? "Executando..." : "Executar teste"}
          </Button>
        </div>
      </form>

      {run.error ? (
        <p className="text-sm text-destructive">{(run.error as Error).message}</p>
      ) : null}

      {run.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Check ok={!!run.data.trackingId} label="Tracking ID" />
            <Check ok={run.data.pixelInjected} label="Pixel de abertura" />
            <Check
              ok={run.data.linksRewritten === run.data.linksTotal && run.data.linksTotal > 0}
              label={`Links reescritos (${run.data.linksRewritten}/${run.data.linksTotal})`}
            />
          </div>

          {run.data.trackingId ? (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Tracking ID</p>
              <pre className="mt-1 break-all text-xs text-foreground">{run.data.trackingId}</pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              FUXICO indisponível ou não configurado — o envio seguiria com o pixel interno
              (degradação segura, sem bloquear o disparo).
            </p>
          )}

          {run.data.sent ? (
            <p className={run.data.sent.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
              {run.data.sent.ok ? "✅ " : "⚠️ "}
              {run.data.sent.message}
            </p>
          ) : null}

          <details className="rounded-lg border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Ver HTML gerado
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs text-muted-foreground">
              {run.data.bodyPreview}
            </pre>
          </details>

          <p className="text-xs text-muted-foreground">
            Depois de abrir o e-mail ou clicar nos links, os eventos aparecem nos contadores acima e
            na linha do tempo do contato.
          </p>
        </div>
      ) : null}
    </section>
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
          <code className="rounded bg-muted px-1">FUXICO_WEBHOOK_SECRET</code> para ativar aberturas
          e cliques. Enquanto isso, os envios continuam usando o pixel interno.
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
      <p className="text-xs text-muted-foreground">
        Eventos dos últimos 30 dias recebidos do FUXICO.
      </p>

      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-foreground">
          URL de webhook para cadastrar no FUXICO
        </p>
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
