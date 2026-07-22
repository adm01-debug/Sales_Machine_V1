import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkEmailDns } from "@/lib/deliverability.functions";

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
    </div>
  );
}