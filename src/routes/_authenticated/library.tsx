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
import { analyzeSms } from "@/lib/sms-segments";
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
        content: "Crie mensagens SMS, RCS e MMS com preview e envio de teste via SINGU.",
      },
    ],
  }),
  component: ComposerPage,
});

type Channel = "sms" | "rcs" | "mms";

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

  const templatesQ = useQuery({
    queryKey: ["sm", "templates"],
    queryFn: () => fetchTemplates(),
  });

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
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
  const [testEntityId, setTestEntityId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const segments = useMemo(() => analyzeSms(body), [body]);

  const resetForm = () => {
    setId(null);
    setName("");
    setChannel("sms");
    setBody("");
    setMediaUrl(null);
    setMediaPath(null);
    setRcs({ type: "rich_card", title: "", description: "", image_url: "", suggestions: [] });
  };

  const loadTemplate = (t: (typeof templatesQ.data extends (infer U)[] | undefined ? U : never)) => {
    setId(t.id);
    setName(t.name);
    setChannel(t.channel as Channel);
    setBody(t.body);
    setMediaUrl(t.media_url ?? null);
    setMediaPath(null);
    const p = (t.rcs_payload ?? null) as RcsPayload | null;
    setRcs(
      p ?? { type: "rich_card", title: "", description: "", image_url: "", suggestions: [] },
    );
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Dê um nome ao template");
      if (!body.trim()) throw new Error("Corpo da mensagem é obrigatório");
      if (channel === "mms" && !mediaUrl) throw new Error("MMS requer mídia");
      const payload = {
        id: id ?? undefined,
        name,
        channel,
        body,
        media_url: channel === "sms" ? null : mediaUrl,
        rcs_payload: channel === "rcs" ? rcs : null,
        variables: extractVariables(body),
      };
      return upsert({ data: payload });
    },
    onSuccess: (res) => {
      toast.success("Template salvo");
      setId(res.id);
      qc.invalidateQueries({ queryKey: ["sm", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      if (!testEntityId) throw new Error("Informe o entity_id para teste");
      const res = await sendTest({
        data: {
          entity_id: testEntityId,
          channel,
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
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="rcs">RCS (rico)</SelectItem>
                      <SelectItem value="mms">MMS (com mídia)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    maxLength={1000}
                    placeholder="Olá {{nome}}, tudo bem?"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{segments.encoding}</Badge>
                    <span>
                      {segments.chars} chars · {segments.segments} segmento
                      {segments.segments > 1 ? "s" : ""} ({segments.perSegment}/seg)
                    </span>
                    <span>· {segments.remaining} até próximo segmento</span>
                    {segments.segments > 1 && (
                      <span className="text-amber-600">
                        · custo x{segments.segments}
                      </span>
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
                      disabled={testMut.isPending}
                    >
                      {testMut.isPending ? "Enviando…" : "Enviar"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <PhonePreview channel={channel} body={body} mediaUrl={mediaUrl} rcs={rcs} />
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

function extractVariables(body: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) set.add(m[1]);
  return [...set];
}

function renderPreview(body: string): string {
  return body
    .replace(/\{\{\s*nome\s*\}\}/gi, "Ana")
    .replace(/\{\{\s*empresa\s*\}\}/gi, "Acme");
}

function PhonePreview({
  channel,
  body,
  mediaUrl,
  rcs,
}: {
  channel: Channel;
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