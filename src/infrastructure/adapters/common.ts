import { createHash } from "node:crypto";
import type { ContentDraft, RawItem } from "@/domain/content";
import type { Source } from "@/domain/source";
import { validatePublicUrl } from "@/infrastructure/http/public-http";

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function list(value: unknown): unknown[] { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
export function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const row = object(value);
  return typeof row["#text"] === "string" || typeof row["#text"] === "number" ? String(row["#text"]) : "";
}
function decodeEntities(value: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? whole;
    const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : "";
  });
}
/** External text is data. No HTML, script, or instructions from a source are executed. */
export function plainText(value: unknown): string {
  return decodeEntities(scalar(value))
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ").replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function safeItemUrl(value: unknown, base?: string): string | null {
  const text = scalar(value).trim();
  if (!text) return null;
  try { return validatePublicUrl(new URL(text, base).href).href; } catch { return null; }
}
export function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}
export function parseDate(value: unknown): string | null {
  const date = new Date(scalar(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export interface ParsedContent { title: string; author: string; text: string; publishedAt: string | null; language?: string }
export function draft(raw: RawItem, source: Source, parsed: ParsedContent, now: () => Date): ContentDraft {
  const url = safeItemUrl(raw.url);
  if (!url) throw new Error("Content item has an unsafe URL.");
  return {
    sourceId: source.id, sourceType: source.type, externalId: raw.externalId,
    title: plainText(parsed.title) || "Untitled", author: plainText(parsed.author), url,
    publishedAt: parsed.publishedAt, rawContent: JSON.stringify(raw.payload),
    normalizedContent: plainText(parsed.text).slice(0, 200_000),
    language: parsed.language || source.metadata.language || "und", fetchedAt: now().toISOString(),
  };
}
export function parseJson(body: string): Record<string, unknown> {
  try { return object(JSON.parse(body)); } catch { throw new Error("Source returned invalid JSON."); }
}
