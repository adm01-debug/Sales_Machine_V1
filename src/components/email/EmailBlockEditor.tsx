import { useMemo } from "react";
import {
  EMAIL_BLOCK_TYPES,
  moveBlock,
  newBlock,
  validateBlocks,
  type Align,
  type EmailBlock,
} from "@/lib/email-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL: Record<EmailBlock["type"], string> = {
  heading: "Título",
  text: "Texto",
  button: "Botão",
  image: "Imagem",
  divider: "Divisor",
  spacer: "Espaço",
};

export interface EmailBlockEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}

/** Editor de blocos do e-mail: adicionar, reordenar, configurar e remover. */
export function EmailBlockEditor({ blocks, onChange }: EmailBlockEditorProps) {
  const issues = useMemo(() => validateBlocks(blocks), [blocks]);

  const add = (type: EmailBlock["type"]) =>
    onChange([...blocks, newBlock(type, `blk_${Date.now()}_${blocks.length}`)]);

  const patch = (index: number, next: Partial<EmailBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? ({ ...b, ...next } as EmailBlock) : b)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {EMAIL_BLOCK_TYPES.map((type) => (
          <Button key={type} type="button" size="sm" variant="outline" onClick={() => add(type)}>
            + {TYPE_LABEL[type]}
          </Button>
        ))}
      </div>

      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum bloco ainda. Comece adicionando um título ou texto.
        </p>
      )}

      <div className="space-y-3">
        {blocks.map((block, index) => {
          const blockIssues = issues.filter((i) => i.blockId === block.id);
          return (
            <div key={block.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{TYPE_LABEL[block.type]}</Badge>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Mover para cima"
                    disabled={index === 0}
                    onClick={() => onChange(moveBlock(blocks, index, -1))}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Mover para baixo"
                    disabled={index === blocks.length - 1}
                    onClick={() => onChange(moveBlock(blocks, index, 1))}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Remover bloco"
                    onClick={() => onChange(blocks.filter((_, i) => i !== index))}
                  >
                    Remover
                  </Button>
                </div>
              </div>

              {(block.type === "heading" || block.type === "text") && (
                <div className="space-y-2">
                  <Label htmlFor={`txt-${block.id}`}>Conteúdo</Label>
                  <Textarea
                    id={`txt-${block.id}`}
                    rows={block.type === "heading" ? 2 : 4}
                    value={block.text}
                    onChange={(e) => patch(index, { text: e.target.value } as Partial<EmailBlock>)}
                  />
                  <AlignPicker
                    value={block.align ?? "left"}
                    onChange={(align) => patch(index, { align } as Partial<EmailBlock>)}
                  />
                </div>
              )}

              {block.type === "button" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`lbl-${block.id}`}>Rótulo</Label>
                    <Input
                      id={`lbl-${block.id}`}
                      value={block.text}
                      onChange={(e) =>
                        patch(index, { text: e.target.value } as Partial<EmailBlock>)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`url-${block.id}`}>URL</Label>
                    <Input
                      id={`url-${block.id}`}
                      value={block.url}
                      onChange={(e) => patch(index, { url: e.target.value } as Partial<EmailBlock>)}
                      placeholder="https://"
                    />
                  </div>
                </div>
              )}

              {block.type === "image" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`img-${block.id}`}>URL da imagem</Label>
                    <Input
                      id={`img-${block.id}`}
                      value={block.url}
                      onChange={(e) => patch(index, { url: e.target.value } as Partial<EmailBlock>)}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`alt-${block.id}`}>Descrição (alt)</Label>
                    <Input
                      id={`alt-${block.id}`}
                      value={block.alt ?? ""}
                      onChange={(e) => patch(index, { alt: e.target.value } as Partial<EmailBlock>)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`href-${block.id}`}>Link ao clicar (opcional)</Label>
                    <Input
                      id={`href-${block.id}`}
                      value={block.href ?? ""}
                      onChange={(e) =>
                        patch(index, { href: e.target.value } as Partial<EmailBlock>)
                      }
                      placeholder="https://"
                    />
                  </div>
                </div>
              )}

              {block.type === "spacer" && (
                <div className="space-y-1">
                  <Label htmlFor={`sp-${block.id}`}>Altura (px)</Label>
                  <Input
                    id={`sp-${block.id}`}
                    type="number"
                    min={4}
                    max={120}
                    value={block.size ?? 24}
                    onChange={(e) =>
                      patch(index, { size: Number(e.target.value) } as Partial<EmailBlock>)
                    }
                  />
                </div>
              )}

              {blockIssues.map((issue) => (
                <p key={issue.message} className="text-xs text-destructive">
                  {issue.message}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlignPicker({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  const options: Align[] = ["left", "center", "right"];
  const label: Record<Align, string> = { left: "Esquerda", center: "Centro", right: "Direita" };
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "secondary" : "ghost"}
          onClick={() => onChange(option)}
        >
          {label[option]}
        </Button>
      ))}
    </div>
  );
}
