import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listTemplates,
  upsertTemplate,
  archiveTemplate,
  duplicateTemplate,
  sendTestMessage,
  getMediaSignedUrl,
} from "@/lib/templates.functions";
import { recordTemplatePreflight } from "@/lib/preflight-history.functions";
import { PreflightHistoryChart } from "@/components/PreflightHistoryChart";
import { analyzeSms } from "@/lib/sms-segments";
import { CHANNELS, type Channel } from "@/lib/audience-rules";
import { CHANNEL_BODY_LIMIT } from "@/lib/campaign-validation";
import {
  extractVariables as extractTemplateVars,
  renderTemplate,
  sampleVarValues,
  unknownVariables,
} from "@/lib/template-vars";
import { MessagePreview } from "@/components/message-preview";
import { EmailBlockEditor } from "@/components/email/EmailBlockEditor";
import { EmailPreflightPanel } from "@/components/email/EmailPreflightPanel";
import { MessagePreflightPanel } from "@/components/message-preflight-panel";
import { ComplianceAuditPanel } from "@/components/compliance-audit-panel";
import { listComplianceTerms } from "@/lib/compliance.functions";
import { blockingMessageFindings, preflightMessage } from "@/lib/message-preflight";
import { blockingFindings, preflightEmailContent } from "@/lib/email-preflight";
import {
  parseBlocks,
  renderEmailHtml,
  renderEmailText,
  validateBlocks,
  type EmailBlock,
} from "@/lib/email-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Compositor · Sales Machine" },
      {
        name: "description",
        content: "Crie criativos multicanal com variáveis, preview e envio de teste via SINGU.",
      },
    ],
  }),
  component: ComposerPage,
});


interface Suggestion {
  type: "reply" | "openUrl" | "dial";
  text: string;
  url?: string;
  phone?: string;
}

interface RcsPayload {
  type: "rich_card";
  title?: string;
  description?: string;
  image_url?: string;
  suggestions: Suggestion[];
}

function ComposerPage() {
  const qc = useQueryClient();
  const fetchTemplates = useServerFn(listTemplates);
  const upsert = useServerFn(upsertTemplate);
  const archive = useServerFn(archiveTemplate);
  const dup = useServerFn(duplicateTemplate);
  const sendTest = useServerFn(sendTestMessage);
  const signUrl = useServerFn(getMediaSignedUrl);
  const recordHistory = useServerFn(recordTemplatePreflight);
  const fetchComplianceTerms = useServerFn(listComplianceTerms);

  const templatesQ = useQuery({
    queryKey: ["sm", "templates"],
    queryFn: () => fetchTemplates(),
  });

  // Termos proibidos do cliente aplicados junto às listas regulatórias embutidas.
  const complianceQ = useQuery({
    queryKey: ["compliance-terms"],
    queryFn: () => fetchComplianceTerms(),
  });
  const complianceRules = useMemo(
    () =>
      (complianceQ.data ?? [])
        .filter((t) => t.is_active)
        .map(({ term, severity, reason, suggestion }) => ({ term, severity, reason, suggestion })),
    [complianceQ.data],
  );

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [rcs, setRcs] = useState<RcsPayload>({
    type: "rich_card",
    title: "",
    description: "",
    image_url: "",
    suggestions: [],
  });
  const [emailBlocks, setEmailBlocks] = useState<EmailBlock[]>([]);
  const [testEntityId, setTestEntityId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const segments = useMemo(() => analyzeSms(body), [body]);
  const emailIssues = useMemo(
    () => (channel === "email" && emailBlocks.length > 0 ? validateBlocks(emailBlocks) : []),
    [channel, emailBlocks],
  );
  const emailHtml = useMemo(
    () => renderEmailHtml(emailBlocks, { subject }),
    [emailBlocks, subject],
  );

  const resetForm = () => {
    setId(null);
    setName("");
    setChannel("sms");
    setSubject("");
    setBody("");
    setMediaUrl(null);
    setMediaPath(null);
    setRcs({ type: "rich_card", title: "", description: "", image_url: "", suggestions: [] });
    setEmailBlocks([]);
  };

  const loadTemplate = (t: (typeof templatesQ.data extends (infer U)[] | undefined ? U : never)) => {
    setId(t.id);
    setName(t.name);
    setChannel(t.channel as Channel);
    setSubject((t as { subject?: string | null }).subject ?? "");
    setBody(t.body);
    setMediaUrl(t.media_url ?? null);
    setMediaPath(null);
    const p = (t.rcs_payload ?? null) as RcsPayload | null;
    setRcs(
      p ?? { type: "rich_card", title: "", description: "", image_url: "", suggestions: [] },
    );
    setEmailBlocks(parseBlocks((t as { email_blocks?: unknown }).email_blocks));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Dê um nome ao template");
      const useBlocks = channel === "email" && emailBlocks.length > 0;
      if (useBlocks) {
        const issues = validateBlocks(emailBlocks);
        if (issues.length > 0) throw new Error(issues[0].message);
      }
      const finalBody = useBlocks ? renderEmailText(emailBlocks) : body;
      if (!finalBody.trim()) throw new Error("Corpo da mensagem é obrigatório");
      if (channel === "mms" && !mediaUrl) throw new Error("MMS requer mídia");
      if (channel === "email" && !subject.trim())
        throw new Error("Templates de e-mail exigem assunto");
      if (channel === "email") {
        const report = preflightEmailContent({ subject, blocks: emailBlocks, body: finalBody });
        const blockers = blockingFindings(report);
        if (blockers.length > 0)
          throw new Error(`Pré-voo bloqueou o salvamento: ${blockers[0].message}`);
      }
      if (finalBody.length > CHANNEL_BODY_LIMIT[channel])
        throw new Error(
          `Limite de ${CHANNEL_BODY_LIMIT[channel]} caracteres excedido para ${channel}`,
        );
      if (channel !== "email") {
        const msgReport = preflightMessage({ channel, body: finalBody, mediaUrl });
        const msgBlockers = blockingMessageFindings(msgReport);
        if (msgBlockers.length > 0)
          throw new Error(`Pré-voo bloqueou o salvamento: ${msgBlockers[0].message}`);
      }
      const unknown = unknownVariables(`${subject}\n${finalBody}`);
      if (unknown.length > 0)
        throw new Error(`Variáveis desconhecidas: ${unknown.map((v) => `{{${v}}}`).join(", ")}`);
      const payload = {
        id: id ?? undefined,
        name,
        channel,
        subject: channel === "email" ? subject : null,
        body: finalBody,
        media_url: channel === "sms" ? null : mediaUrl,
        rcs_payload: channel === "rcs" ? rcs : null,
        email_blocks: useBlocks ? (emailBlocks as unknown as Record<string, unknown>[]) : null,
        variables: extractTemplateVars(`${subject}\n${finalBody}`),
      };
      const res = await upsert({ data: payload });
      
      // Gravar histórico de pré-voo após sucesso
      if (channel === "email") {
        const report = preflightEmailContent({ subject, blocks: emailBlocks, body: finalBody });
        await recordHistory({ data: { templateId: res.id, score: report.score, findings: report.findings } });
      } else {
        const msgReport = preflightMessage({ channel, body: finalBody, mediaUrl });
        await recordHistory({ data: { templateId: res.id, score: msgReport.score, findings: msgReport.findings } });
      }

      return res;
    },
    onSuccess: (res) => {
      toast.success("Template salvo");
      setId(res.id);
      qc.invalidateQueries({ queryKey: ["sm", "templates"] });
      qc.invalidateQueries({ queryKey: ["template-preflight-history", res.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      if (!testEntityId) throw new Error("Informe o entity_id para teste");
      const res = await sendTest({
        data: {
          entity_id: testEntityId,
          channel: channel as "sms" | "rcs" | "mms",
          body,
          media_url: channel !== "sms" ? mediaUrl : null,
          rcs_payload: channel === "rcs" ? rcs : null,
        },
      });
      if (!res.ok) throw new Error(res.error ?? "falha no envio");
      return res;
    },
    onSuccess: () => toast.success("Enviado com sucesso"),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("message-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const signed = await signUrl({ data: { path } });
      setMediaPath(path);
      setMediaUrl(signed.url);
      toast.success("Mídia enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compositor</h1>
            <p className="text-sm text-muted-foreground">
              Templates de SMS, RCS e MMS para cadências e envios diretos.
            </p>
          </div>
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              Voltar
            </Button>
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Editor + Preview */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Editor</CardTitle>
                <CardDescription>
                  Use <code>{"{{nome}}"}</code> e <code>{"{{empresa}}"}</code> como variáveis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Follow-up dia 3"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {channel === "email" && (
                  <div className="space-y-2">
                    <Label htmlFor="tpl-subject">Assunto</Label>
                    <Input
                      id="tpl-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={200}
                      placeholder="Assunto do e-mail — aceita {{empresa}}"
                    />
                  </div>
                )}

                {channel === "email" && (
                  <div className="space-y-2 border-t pt-4">
                    <Label>Blocos do e-mail</Label>
                    <p className="text-xs text-muted-foreground">
                      Com blocos, o HTML responsivo é gerado automaticamente e o texto abaixo vira
                      apenas o fallback.
                    </p>
                    <EmailBlockEditor blocks={emailBlocks} onChange={setEmailBlocks} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {channel === "email" && emailBlocks.length > 0
                      ? "Fallback texto (gerado dos blocos)"
                      : "Mensagem"}
                  </Label>
                  <Textarea
                    value={
                      channel === "email" && emailBlocks.length > 0
                        ? renderEmailText(emailBlocks)
                        : body
                    }
                    onChange={(e) => setBody(e.target.value)}
                    readOnly={channel === "email" && emailBlocks.length > 0}
                    rows={5}
                    maxLength={CHANNEL_BODY_LIMIT[channel]}
                    placeholder="Olá {{nome}}, tudo bem?"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {body.length}/{CHANNEL_BODY_LIMIT[channel]} caracteres
                    </span>
                    {(channel === "sms" || channel === "mms") && (
                    <>
                    <Badge variant="secondary">{segments.encoding}</Badge>
                    <span>
                      {segments.chars} chars · {segments.segments} segmento
                      {segments.segments > 1 ? "s" : ""} ({segments.perSegment}/seg)
                    </span>
                    <span>· {segments.remaining} até próximo segmento</span>
                    {segments.segments > 1 && (
                      <span className="text-muted-foreground">
                        · custo x{segments.segments}
                      </span>
                    )}
                    </>
                    )}
                  </div>
                </div>

                {channel === "mms" && (
                  <div className="space-y-2">
                    <Label>Mídia (imagem/vídeo)</Label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,video/*"
                      className="text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(f);
                      }}
                    />
                    {uploading && (
                      <p className="text-xs text-muted-foreground">Enviando…</p>
                    )}
                    {mediaUrl && (
                      <p className="break-all text-xs text-muted-foreground">
                        {mediaPath ?? mediaUrl}
                      </p>
                    )}
                  </div>
                )}

                {channel === "rcs" && (
                  <RcsBuilder value={rcs} onChange={setRcs} />
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    {saveMut.isPending ? "Salvando…" : id ? "Atualizar" : "Salvar template"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Novo
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <Label>Enviar teste (entity_id)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={testEntityId}
                      onChange={(e) => setTestEntityId(e.target.value)}
                      placeholder="uuid da entity com mapeamento SINGU"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => testMut.mutate()}
                      disabled={
                        testMut.isPending ||
                        !(channel === "sms" || channel === "rcs" || channel === "mms")
                      }
                    >
                      {testMut.isPending ? "Enviando…" : "Enviar"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {channel === "sms" || channel === "rcs" || channel === "mms" ? (
              <div className="space-y-4">
                <PhonePreview channel={channel} body={body} mediaUrl={mediaUrl} rcs={rcs} />
                <MessagePreflightPanel channel={channel} body={body} mediaUrl={mediaUrl} />
                <ComplianceAuditPanel
                  text={`${subject ?? ""}\n${body}`}
                  customRules={complianceRules}
                />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>Variáveis resolvidas com dados de exemplo.</CardDescription>
                </CardHeader>
                <CardContent>
                  {channel === "email" && emailBlocks.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{subject || "(sem assunto)"}</p>
                      <iframe
                        title="Preview do e-mail"
                        srcDoc={renderPreviewHtml(emailHtml)}
                        sandbox=""
                        className="h-[460px] w-full rounded-md border bg-background"
                      />
                      {emailIssues.map((issue) => (
                        <p key={`${issue.blockId}-${issue.message}`} className="text-xs text-destructive">
                          {issue.message}
                        </p>
                      ))}
                      <EmailPreflightPanel subject={subject} blocks={emailBlocks} />
                    </div>
                  ) : (
                    <MessagePreview
                      channel={channel}
                      subject={subject}
                      body={body}
                      mediaUrl={mediaUrl}
                    />
                  )}
                  {id && <PreflightHistoryChart templateId={id} />}
                  {channel !== "email" && (
                    <MessagePreflightPanel
                      className="mt-3"
                      channel={channel}
                      body={body}
                      mediaUrl={mediaUrl}
                    />
                  )}
                  <ComplianceAuditPanel
                    className="mt-3"
                    text={`${subject ?? ""}\n${body}`}
                    customRules={complianceRules}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar de templates salvos */}
          <Card>
            <CardHeader>
              <CardTitle>Templates salvos</CardTitle>
              <CardDescription>
                {templatesQ.data?.length ?? 0} no total
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {templatesQ.isLoading && (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              )}
              {templatesQ.data?.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-md border p-3 text-sm ${
                    t.archived ? "opacity-50" : ""
                  } ${id === t.id ? "border-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.body}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 uppercase">
                      {t.channel}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => loadTemplate(t)}>
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await dup({ data: { id: t.id } });
                        qc.invalidateQueries({ queryKey: ["sm", "templates"] });
                        toast.success("Duplicado");
                      }}
                    >
                      Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await archive({ data: { id: t.id, archived: !t.archived } });
                        qc.invalidateQueries({ queryKey: ["sm", "templates"] });
                      }}
                    >
                      {t.archived ? "Restaurar" : "Arquivar"}
                    </Button>
                  </div>
                </div>
              ))}
              {!templatesQ.isLoading && (templatesQ.data?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum template ainda. Crie o primeiro à esquerda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function renderPreview(body: string): string {
  // Preview do telefone usa o mesmo motor de variáveis dos workers.
  return renderTemplate(body, sampleVarValues()).text;
}

function renderPreviewHtml(html: string): string {
  // O preview resolve variáveis com dados de exemplo, igual aos workers.
  return renderTemplate(html, sampleVarValues()).text;
}

function PhonePreview({
  channel,
  body,
  mediaUrl,
  rcs,
}: {
  channel: "sms" | "rcs" | "mms";
  body: string;
  mediaUrl: string | null;
  rcs: RcsPayload;
}) {
  const rendered = renderPreview(body);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>Simulação de celular</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mx-auto max-w-[280px] rounded-[36px] border-4 border-foreground/20 bg-muted/40 p-3">
          <div className="rounded-3xl bg-background p-3 shadow-inner">
            <div className="mb-2 text-center text-xs text-muted-foreground">
              Mensagens · agora
            </div>
            {channel === "sms" && (
              <div className="whitespace-pre-wrap rounded-2xl bg-primary/10 p-3 text-sm">
                {rendered || "…"}
              </div>
            )}
            {channel === "mms" && (
              <div className="space-y-2 rounded-2xl bg-primary/10 p-2 text-sm">
                {mediaUrl && /\.(mp4|webm|mov)$/i.test(mediaUrl) ? (
                  <video src={mediaUrl} controls className="w-full rounded-xl" />
                ) : mediaUrl ? (
                  <img src={mediaUrl} alt="mídia" className="w-full rounded-xl" />
                ) : (
                  <div className="grid h-32 place-items-center rounded-xl bg-muted text-xs text-muted-foreground">
                    sem mídia
                  </div>
                )}
                <p className="whitespace-pre-wrap p-1">{rendered || "…"}</p>
              </div>
            )}
            {channel === "rcs" && (
              <div className="overflow-hidden rounded-2xl bg-primary/10 text-sm">
                {rcs.image_url ? (
                  <img src={rcs.image_url} alt="" className="h-32 w-full object-cover" />
                ) : (
                  <div className="h-24 bg-muted" />
                )}
                <div className="space-y-1 p-3">
                  {rcs.title && <p className="font-semibold">{rcs.title}</p>}
                  {rcs.description && (
                    <p className="text-xs text-muted-foreground">{rcs.description}</p>
                  )}
                  <p className="whitespace-pre-wrap pt-1">{rendered || "…"}</p>
                </div>
                {rcs.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-t bg-background p-2">
                    {rcs.suggestions.map((s, i) => (
                      <Badge key={i} variant="outline" className="cursor-default">
                        {s.text}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RcsBuilder({
  value,
  onChange,
}: {
  value: RcsPayload;
  onChange: (v: RcsPayload) => void;
}) {
  const update = (patch: Partial<RcsPayload>) => onChange({ ...value, ...patch });
  const addSuggestion = () => {
    if (value.suggestions.length >= 4) return;
    onChange({
      ...value,
      suggestions: [...value.suggestions, { type: "reply", text: "Ok" }],
    });
  };
  const updateSuggestion = (i: number, patch: Partial<Suggestion>) => {
    const next = value.suggestions.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, suggestions: next });
  };
  const removeSuggestion = (i: number) => {
    onChange({ ...value, suggestions: value.suggestions.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Título</Label>
          <Input value={value.title ?? ""} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Imagem (URL)</Label>
          <Input
            value={value.image_url ?? ""}
            onChange={(e) => update({ image_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Descrição</Label>
        <Textarea
          value={value.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Ações sugeridas (máx 4)</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={addSuggestion}
            disabled={value.suggestions.length >= 4}
          >
            Adicionar
          </Button>
        </div>
        {value.suggestions.map((s, i) => (
          <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-[110px_1fr_1fr_auto]">
            <Select
              value={s.type}
              onValueChange={(v) => updateSuggestion(i, { type: v as Suggestion["type"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reply">Resposta</SelectItem>
                <SelectItem value="openUrl">Abrir URL</SelectItem>
                <SelectItem value="dial">Ligar</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={s.text}
              maxLength={25}
              onChange={(e) => updateSuggestion(i, { text: e.target.value })}
              placeholder="Rótulo"
            />
            {s.type === "openUrl" ? (
              <Input
                value={s.url ?? ""}
                onChange={(e) => updateSuggestion(i, { url: e.target.value })}
                placeholder="https://…"
              />
            ) : s.type === "dial" ? (
              <Input
                value={s.phone ?? ""}
                onChange={(e) => updateSuggestion(i, { phone: e.target.value })}
                placeholder="+5511…"
              />
            ) : (
              <div />
            )}
            <Button size="sm" variant="ghost" onClick={() => removeSuggestion(i)}>
              ×
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}