import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/templates.functions";
import type { Channel } from "@/lib/audience-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PickedTemplate {
  id: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
  media_url: string | null;
  rcs_payload: Record<string, unknown> | null;
}

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Canal da campanha — templates deste canal aparecem primeiro. */
  channel: Channel;
  onSelect: (template: PickedTemplate) => void;
}

/** Seleciona um criativo da Biblioteca para preencher uma variante. */
export function TemplatePickerDialog({
  open,
  onOpenChange,
  channel,
  onSelect,
}: TemplatePickerDialogProps) {
  const fetchTemplates = useServerFn(listTemplates);
  const [search, setSearch] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["sm", "templates"],
    queryFn: () => fetchTemplates(),
    enabled: open,
  });

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (templatesQuery.data ?? [])
      .filter((t) => !t.archived)
      .filter((t) => !term || `${t.name} ${t.body}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.channel === channel) - Number(a.channel === channel));
  }, [templatesQuery.data, search, channel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Usar template da biblioteca</DialogTitle>
          <DialogDescription>
            Criativos do canal {channel} aparecem primeiro. O conteúdo substitui a variante atual.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou conteúdo"
        />

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {templatesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : null}
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect({
                  id: t.id,
                  name: t.name,
                  channel: t.channel as Channel,
                  subject: (t as { subject?: string | null }).subject ?? null,
                  body: t.body,
                  media_url: t.media_url,
                  rcs_payload: (t.rcs_payload ?? null) as Record<string, unknown> | null,
                });
                onOpenChange(false);
              }}
              className={cn(
                "w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-accent",
                t.channel !== channel && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{t.name}</p>
                <Badge
                  variant={t.channel === channel ? "default" : "outline"}
                  className="uppercase"
                >
                  {t.channel}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
            </button>
          ))}
          {!templatesQuery.isLoading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum template encontrado. Crie um na Biblioteca.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
