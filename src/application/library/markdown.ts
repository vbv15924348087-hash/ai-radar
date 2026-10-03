import type { FeedItem } from "@/domain/intelligence";

export interface MarkdownExporter { exportMarkdown(item: FeedItem): string }

function escapeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|\-])/g, "\\$1");
}

function linkDestination(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Markdown 原文链接必须使用 HTTP(S)");
  return url.href.replace(/</g, "%3C").replace(/>/g, "%3E");
}

export function exportMarkdown(item: FeedItem): string {
  const frontmatter: Record<string, string | string[] | number | null> = {
    title: item.content.title, source: item.sourceName, source_type: item.content.sourceType,
    topics: item.topics, score: item.finalScore, published_at: item.content.publishedAt, url: item.content.url,
  };
  const metadata = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  const evidence = item.evidence.map(entry => `> ${escapeText(entry.quote).replace(/\n/g, "\n> ")}\n\n[原文证据](<${linkDestination(entry.url)}>)`).join("\n\n");
  return [
    "---", metadata, "---", "", `# ${escapeText(item.content.title).replace(/\n/g, " ")}`, "",
    "## TL;DR", "", escapeText(item.summary), "",
    "## Why It Matters", "", escapeText(item.whyItMatters), "",
    "## Key Changes", "", ...item.keyChanges.map(change => `- ${escapeText(change).replace(/\n/g, "\n  ")}`), "",
    "## Product Impact", "", escapeText(item.productImpact), "",
    "## Related Topics", "", item.topics.map(escapeText).join("、") || "暂无关联主题", "",
    "## Evidence", "", evidence, "",
    "## Source", "", `[${escapeText(item.sourceName)}](<${linkDestination(item.content.url)}>)`, "",
    `来源类型：${escapeText(item.content.sourceType)} · 推荐分：${item.finalScore} / 100`, "",
    `分析方式：${escapeText(item.provider)} · 处理版本：${escapeText(item.processingVersion)}`, "",
  ].join("\n");
}

export class StandardMarkdownExporter implements MarkdownExporter {
  exportMarkdown(item: FeedItem): string { return exportMarkdown(item); }
}
