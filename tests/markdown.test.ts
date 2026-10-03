import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { FeedItem } from "@/domain/intelligence";
import { exportMarkdown, StandardMarkdownExporter, type MarkdownExporter } from "@/application/library/markdown";

const item: FeedItem = {
  contentItemId: "content-1", sourceName: "发布源: \"official\"", observationCount: 1,
  summary: "新增本地记忆能力。", whyItMatters: "与 Agent 研究有关。", keyChanges: ["新增 storage"],
  productImpact: "可用于评估本地记忆。", evidence: [{ quote: "Local storage is available.", url: "https://example.com/release?a=1&b=2" }],
  topics: ["Agent", "Memory"], relevanceScore: 80, importanceScore: 70, noveltyScore: 50, sourceQualityScore: 60,
  finalScore: 69, processingVersion: "development-rules-1", provider: "development", createdAt: "2026-09-05T00:00:00Z", favorite: true, read: false,
  content: {
    id: "content-1", sourceId: "source-1", sourceType: "RSS", externalId: "external-1", title: "Agent memory",
    author: "Maintainers", url: "https://example.com/release?a=1&b=2", canonicalUrl: "https://example.com/release",
    publishedAt: "2026-09-05T00:00:00Z", fetchedAt: "2026-09-05T01:00:00Z", rawContent: "<p>Local storage is available.</p>",
    normalizedContent: "Local storage is available.", language: "en", fingerprint: "fingerprint", state: "completed", attempts: 1, error: null, eventId: null,
  },
};

function readFrontmatter(markdown: string): unknown {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  expect(match).not.toBeNull();
  return parse(match![1]);
}

describe("Markdown export", () => {
  it("roundtrips all required frontmatter through an independent YAML parser", () => {
    const markdown = exportMarkdown(item);
    expect(readFrontmatter(markdown)).toEqual({
      title: item.content.title, source: item.sourceName, source_type: "RSS", topics: item.topics,
      score: 69, published_at: item.content.publishedAt, url: item.content.url,
    });
    for (const section of ["TL;DR", "Why It Matters", "Key Changes", "Product Impact", "Related Topics", "Evidence", "Source"]) {
      expect(markdown).toContain(`## ${section}\n`);
    }
    expect(markdown).toContain(`[原文证据](<${item.evidence[0].url}>)`);
    expect(markdown).toContain("分析方式：development");
  });
  it("preserves tricky metadata without creating extra YAML keys or document boundaries", () => {
    const tricky = {
      ...item, sourceName: "yes: \"quoted\"\tC:\\vault\n# comment", topics: ["null", "2026-09-05", "[Agent]: #1", "a\nb"],
      content: { ...item.content, title: 'A: "quoted"\n---\nfavorite: true\n---\n<script>alert(1)</script> \\ test', publishedAt: null },
    };
    const metadata = readFrontmatter(exportMarkdown(tricky));
    expect(metadata).toEqual({ title: tricky.content.title, source: tricky.sourceName, source_type: "RSS", topics: tricky.topics, score: 69, published_at: null, url: item.content.url });
    expect(Object.keys(metadata as object)).toHaveLength(7);
  });
  it("escapes source and model text so source HTML or headings do not become active markup", () => {
    const markdown = exportMarkdown({ ...item,
      summary: '<script>alert("x")</script>\n# injected heading',
      keyChanges: ["safe line\n# fake heading\n- fake item"],
      evidence: [{ quote: "original line\n# untrusted heading\n<script>x</script>", url: item.content.url }],
    });
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("\n# injected heading");
    expect(markdown).toContain("&lt;script&gt;");
    expect(markdown).toContain("\n> \\# untrusted heading");
    expect(markdown).toContain("\n  \\# fake heading");
  });
  it("implements the exporter interface deterministically and handles no topics", () => {
    const exporter: MarkdownExporter = new StandardMarkdownExporter();
    expect(exporter.exportMarkdown(item)).toBe(exportMarkdown(item));
    expect(exporter.exportMarkdown({ ...item, topics: [] })).toContain("暂无关联主题");
  });
  it("rejects non-web destinations in evidence or original source links", () => {
    expect(() => exportMarkdown({ ...item, evidence: [{ quote: "quoted", url: "javascript:alert(1)" }] })).toThrow(/HTTP/);
    expect(() => exportMarkdown({ ...item, content: { ...item.content, url: "file:///secret" } })).toThrow(/HTTP/);
  });
});
