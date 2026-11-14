/**
 * Motor de blocos de e-mail (Fase 3 - editor visual).
 *
 * Módulo puro e testável: converte blocos JSON em HTML responsivo baseado em
 * tabelas (compatível com Outlook/Gmail) e em uma versão texto usada como
 * fallback e como corpo curto do template.
 *
 * Segurança: todo conteúdo do usuário é escapado e URLs só são aceitas em
 * http(s)/mailto, impedindo `javascript:` em href/src.
 */

export type Align = "left" | "center" | "right";

export type EmailBlock =
  | { id: string; type: "heading"; text: string; level?: 1 | 2 | 3; align?: Align }
  | { id: string; type: "text"; text: string; align?: Align }
  | { id: string; type: "button"; text: string; url: string; align?: Align }
  | { id: string; type: "image"; url: string; alt?: string; href?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; size?: number };

export const EMAIL_BLOCK_TYPES: EmailBlock["type"][] = [
  "heading",
  "text",
  "button",
  "image",
  "divider",
  "spacer",
];

export interface EmailTheme {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accentText: string;
  fontFamily: string;
  maxWidth: number;
}

export const DEFAULT_EMAIL_THEME: EmailTheme = {
  background: "#f4f5f7",
  surface: "#ffffff",
  text: "#1f2430",
  accent: "#111827",
  accentText: "#ffffff",
  fontFamily: "Helvetica, Arial, sans-serif",
  maxWidth: 600,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Aceita apenas esquemas seguros; caso contrário devolve `null`. */
export function safeUrl(raw: string | undefined | null): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  return null;
}

export function newBlock(type: EmailBlock["type"], id: string): EmailBlock {
  switch (type) {
    case "heading":
      return { id, type, text: "Título", level: 2, align: "left" };
    case "text":
      return { id, type, text: "Escreva aqui o seu texto.", align: "left" };
    case "button":
      return { id, type, text: "Saiba mais", url: "https://", align: "center" };
    case "image":
      return { id, type, url: "", alt: "" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: 24 };
  }
}

export interface BlockIssue {
  blockId: string;
  message: string;
}

/** Valida os blocos antes de salvar/enviar. */
export function validateBlocks(blocks: EmailBlock[]): BlockIssue[] {
  const issues: BlockIssue[] = [];
  if (blocks.length === 0) {
    issues.push({ blockId: "", message: "Adicione ao menos um bloco ao e-mail." });
  }
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) {
      issues.push({ blockId: block.id, message: "ID de bloco duplicado." });
    }
    seen.add(block.id);
    switch (block.type) {
      case "heading":
      case "text":
        if (!block.text.trim()) issues.push({ blockId: block.id, message: "Texto vazio." });
        break;
      case "button":
        if (!block.text.trim())
          issues.push({ blockId: block.id, message: "Rótulo do botão vazio." });
        if (!safeUrl(block.url))
          issues.push({ blockId: block.id, message: "URL do botão inválida (use http/https)." });
        break;
      case "image":
        if (!safeUrl(block.url))
          issues.push({ blockId: block.id, message: "URL da imagem inválida (use http/https)." });
        if (!block.alt?.trim())
          issues.push({
            blockId: block.id,
            message: "Descreva a imagem (alt) para acessibilidade.",
          });
        if (block.href && !safeUrl(block.href))
          issues.push({ blockId: block.id, message: "Link da imagem inválido." });
        break;
      case "spacer":
        if (block.size != null && (block.size < 4 || block.size > 120))
          issues.push({ blockId: block.id, message: "Espaçamento deve ficar entre 4 e 120px." });
        break;
      case "divider":
        break;
    }
  }
  return issues;
}

function renderBlock(block: EmailBlock, theme: EmailTheme): string {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? 28 : block.level === 3 ? 18 : 22;
      return `<tr><td align="${block.align ?? "left"}" style="padding:8px 24px;font-family:${theme.fontFamily};font-size:${size}px;line-height:1.3;font-weight:bold;color:${theme.text};">${escapeHtml(block.text)}</td></tr>`;
    }
    case "text": {
      const html = escapeHtml(block.text).replace(/\n/g, "<br />");
      return `<tr><td align="${block.align ?? "left"}" style="padding:8px 24px;font-family:${theme.fontFamily};font-size:15px;line-height:1.6;color:${theme.text};">${html}</td></tr>`;
    }
    case "button": {
      const url = safeUrl(block.url) ?? "#";
      return `<tr><td align="${block.align ?? "center"}" style="padding:16px 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:${theme.accent};color:${theme.accentText};font-family:${theme.fontFamily};font-size:15px;font-weight:bold;text-decoration:none;">${escapeHtml(block.text)}</a></td></tr>`;
    }
    case "image": {
      const url = safeUrl(block.url);
      if (!url) return "";
      const width = theme.maxWidth - 48;
      const img = `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt ?? "")}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;" />`;
      const href = safeUrl(block.href);
      const inner = href ? `<a href="${escapeHtml(href)}">${img}</a>` : img;
      return `<tr><td align="center" style="padding:12px 24px;">${inner}</td></tr>`;
    }
    case "divider":
      return `<tr><td style="padding:12px 24px;"><hr style="border:none;border-top:1px solid #e2e5ea;margin:0;" /></td></tr>`;
    case "spacer": {
      const size = block.size ?? 24;
      return `<tr><td style="height:${size}px;line-height:${size}px;font-size:0;">&nbsp;</td></tr>`;
    }
  }
}

/** HTML final responsivo, pronto para o provedor de envio. */
export function renderEmailHtml(
  blocks: EmailBlock[],
  opts: { subject?: string; theme?: EmailTheme } = {},
): string {
  const theme = opts.theme ?? DEFAULT_EMAIL_THEME;
  const rows = blocks.map((b) => renderBlock(b, theme)).join("");
  const title = escapeHtml(opts.subject ?? "");
  return [
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    `<title>${title}</title></head>`,
    `<body style="margin:0;padding:0;background:${theme.background};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.background};padding:24px 0;">`,
    `<tr><td align="center"><table role="presentation" width="${theme.maxWidth}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${theme.maxWidth}px;background:${theme.surface};border-radius:8px;overflow:hidden;">`,
    rows,
    "</table></td></tr></table></body></html>",
  ].join("");
}

/** Versão texto - fallback de clientes sem HTML e corpo curto do template. */
export function renderEmailText(blocks: EmailBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "text":
        if (block.text.trim()) parts.push(block.text.trim());
        break;
      case "button": {
        const url = safeUrl(block.url);
        parts.push(url ? `${block.text.trim()}: ${url}` : block.text.trim());
        break;
      }
      case "image": {
        const url = safeUrl(block.url);
        if (url) parts.push(`[imagem] ${block.alt?.trim() || url}`);
        break;
      }
      case "divider":
        parts.push("---");
        break;
      case "spacer":
        break;
    }
  }
  return parts.join("\n\n").trim();
}

/** Move um bloco preservando os limites da lista. */
export function moveBlock(blocks: EmailBlock[], index: number, delta: number): EmailBlock[] {
  const target = index + delta;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Normaliza blocos vindos do banco (jsonb) descartando entradas inválidas. */
export function parseBlocks(raw: unknown): EmailBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: EmailBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const type = b.type as EmailBlock["type"];
    if (!EMAIL_BLOCK_TYPES.includes(type)) continue;
    const id = typeof b.id === "string" && b.id ? b.id : `blk_${out.length + 1}`;
    out.push({ ...newBlock(type, id), ...b, id, type } as EmailBlock);
  }
  return out;
}
