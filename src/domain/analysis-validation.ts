import { analysisSchema, type Analysis } from "@/domain/intelligence";
import type { ContentItem } from "@/domain/content";
import type { Topic } from "@/domain/topic";

function normalizeQuote(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function sourceUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("证据来源必须使用 HTTP(S) 链接");
  return url.href;
}

/** A model conforming to JSON Schema still needs grounding and topic checks. */
export function validateAnalysis(value: unknown, content: ContentItem, topics: Topic[]): Analysis {
  const result = analysisSchema.parse(value);
  const allowedTopics = new Set(topics.map(topic => topic.id));
  if (result.topics.some(id => !allowedTopics.has(id))) throw new Error("AI 输出包含未知 Topic ID");
  if (new Set(result.topics).size !== result.topics.length) throw new Error("AI 输出包含重复 Topic ID");
  const allowedUrls = new Set([sourceUrl(content.url), sourceUrl(content.canonicalUrl)]);
  const documents = [normalizeQuote(content.title), normalizeQuote(content.normalizedContent)];
  for (const evidence of result.evidence) {
    const quote = normalizeQuote(evidence.quote);
    if (!quote || !documents.some(document => document.includes(quote))) {
      throw new Error("AI 证据引用无法在原文中核验");
    }
    if (!allowedUrls.has(sourceUrl(evidence.url))) throw new Error("AI 证据链接不属于当前原始来源");
  }
  return result;
}
