/**
 * Contagem de segmentos SMS.
 * - GSM-7 (alfabeto padrão): 160 chars single, 153 por segmento em multi.
 * - UCS-2 (unicode, ex: emoji, acentos raros): 70 single, 67 por segmento.
 * Caracteres do "extension table" GSM-7 (^, {, }, [, ], ~, |, €, \) contam como 2.
 */

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXT.includes(ch)) return false;
  }
  return true;
}

function gsm7Length(text: string): number {
  let len = 0;
  for (const ch of text) len += GSM7_EXT.includes(ch) ? 2 : 1;
  return len;
}

export interface SegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  chars: number;
  segments: number;
  perSegment: number;
  remaining: number;
}

export function analyzeSms(text: string): SegmentInfo {
  if (!text) {
    return { encoding: "GSM-7", chars: 0, segments: 1, perSegment: 160, remaining: 160 };
  }
  const gsm = isGsm7(text);
  if (gsm) {
    const chars = gsm7Length(text);
    const single = 160;
    const multi = 153;
    const segments = chars <= single ? 1 : Math.ceil(chars / multi);
    const perSegment = segments === 1 ? single : multi;
    const remaining = segments * perSegment - chars;
    return { encoding: "GSM-7", chars, segments, perSegment, remaining };
  }
  // UCS-2 conta unidades de código UTF-16: um emoji fora do BMP custa 2.
  const chars = text.length;
  const single = 70;
  const multi = 67;
  const segments = chars <= single ? 1 : Math.ceil(chars / multi);
  const perSegment = segments === 1 ? single : multi;
  const remaining = segments * perSegment - chars;
  return { encoding: "UCS-2", chars, segments, perSegment, remaining };
}
