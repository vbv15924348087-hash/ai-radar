import { describe, expect, it, vi } from "vitest";
import { createAdapterRegistry, validateSourceLocation } from "@/infrastructure/adapters";
import { parseFeed } from "@/infrastructure/adapters/rss";
import { plainText } from "@/infrastructure/adapters/common";
import type { Source, SourceType } from "@/domain/source";
import type { PublicHttpClient, PublicHttpResponse } from "@/infrastructure/http/public-http";

const fixedTime = "2026-09-05T10:00:00.000Z";
function source(type: SourceType, urlOrIdentifier = "https://example.com/feed.xml"): Source {
  return { id: "source-fixture", name: "Fixture", type, urlOrIdentifier, enabled: true, priority: 3, metadata: {}, lastCheckedAt: null, lastError: null, createdAt: fixedTime, updatedAt: fixedTime };
}
const result = (body: string, url = "https://example.com/feed.xml"): PublicHttpResponse => ({ url, status: 200, headers: {}, body });
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Research Lab</title><language>en</language><item><guid isPermaLink="false">release-123</guid><title>Model &amp; tools</title><link>https://example.com/posts/model</link><author>Alice</author><pubDate>Fri, 04 Sep 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>New <b>model</b> released.</p><script>steal()</script><p>Tool calling available.</p>]]></description></item></channel></rss>`;
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv</title><entry><id>http://arxiv.org/abs/2609.12345v1</id><title>A Research Paper</title><published>2026-09-04T10:00:00Z</published><author><name>Alice</name></author><author><name>Bob</name></author><link rel="related" href="https://example.com/pdf"/><link rel="alternate" href="https://arxiv.org/abs/2609.12345v1"/><summary>Evidence from controlled evaluation.</summary></entry></feed>`;

describe("source adapters", () => {
  it("registers all six source types behind one contract", () => {
    expect([...createAdapterRegistry({ env: {} }).keys()]).toEqual(["RSS", "GitHub", "Blog", "Paper", "YouTube", "X"]);
  });

  it("discovers RSS, preserves stable IDs and raw snapshots, and normalizes plain text", async () => {
    const http = vi.fn<PublicHttpClient>(async () => result(rss));
    const adapter = createAdapterRegistry({ http, now: () => new Date(fixedTime) }).get("RSS")!;
    const input = source("RSS");
    const [item] = await adapter.discover(input);
    expect(item.externalId).toBe("release-123");
    const normalized = adapter.normalize(await adapter.fetch(item, input), input);
    expect(normalized).toMatchObject({ sourceId: input.id, sourceType: "RSS", externalId: "release-123", title: "Model & tools", author: "Alice", language: "en", fetchedAt: fixedTime, publishedAt: "2026-09-04T12:00:00.000Z" });
    expect(normalized.normalizedContent).toContain("New model released.");
    expect(normalized.normalizedContent).not.toMatch(/steal|<script|<p>/);
    expect(JSON.parse(normalized.rawContent).entry.description).toContain("<script>steal()");
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("uses relative RSS links and repeatable hashes when a feed omits IDs", () => {
    const xml = `<rss><channel><item><title>One</title><link>/post/1</link></item></channel></rss>`;
    const first = parseFeed(xml, "https://example.com/feed.xml")[0];
    expect(first.url).toBe("https://example.com/post/1");
    expect(parseFeed(xml, "https://example.com/feed.xml")[0].externalId).toBe(first.externalId);
  });

  it("excludes unsafe item URLs and rejects document entities, malformed XML, and non-feeds", () => {
    expect(parseFeed(`<rss><channel><item><title>Unsafe</title><link>http://127.0.0.1/admin</link></item></channel></rss>`, "https://example.com/feed")).toEqual([]);
    expect(parseFeed(`<rss><channel><item><guid>opaque-id</guid><title>Missing link</title></item></channel></rss>`, "https://example.com/feed")).toEqual([]);
    expect(() => parseFeed(`<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>`, "https://example.com/feed")).toThrow(/entity declarations/);
    expect(() => parseFeed("<rss><channel>", "https://example.com/feed")).toThrow(/malformed XML/);
    expect(() => parseFeed("<html><body>page</body></html>", "https://example.com/feed")).toThrow(/RSS or Atom/);
  });

  it("reads blog content through the supplied feed URL", async () => {
    const http = vi.fn<PublicHttpClient>(async () => result(rss));
    const adapter = createAdapterRegistry({ http }).get("Blog")!;
    const input = source("Blog");
    const [item] = await adapter.discover(input);
    expect(adapter.normalize(item, input).sourceType).toBe("Blog");
    expect(http.mock.calls[0][0]).toBe(input.urlOrIdentifier);
  });

  it("builds encoded arXiv queries and normalizes Atom authors and alternate URLs", async () => {
    const http = vi.fn<PublicHttpClient>(async () => result(atom, "https://export.arxiv.org/api/query"));
    const adapter = createAdapterRegistry({ http }).get("Paper")!;
    const input = source("Paper", "cat:cs.AI AND all:agents");
    const [item] = await adapter.discover(input);
    const requested = new URL(http.mock.calls[0][0]);
    expect(requested.searchParams.get("search_query")).toBe("cat:cs.AI AND all:agents");
    expect(adapter.normalize(item, input)).toMatchObject({ sourceType: "Paper", author: "Alice, Bob", url: "https://arxiv.org/abs/2609.12345v1", normalizedContent: "Evidence from controlled evaluation." });
  });

  it("reads real GitHub release metadata with a stable release ID", async () => {
    const http = vi.fn<PublicHttpClient>(async () => result(JSON.stringify([{ id: 12345, name: "v1.2", tag_name: "v1.2", html_url: "https://github.com/openai/example/releases/tag/v1.2", author: { login: "maintainer" }, body: "Adds structured output.", published_at: "2026-09-04T12:00:00Z" }])));
    const adapter = createAdapterRegistry({ http, env: {} }).get("GitHub")!;
    const input = source("GitHub", "openai/example");
    const [item] = await adapter.discover(input);
    expect(http.mock.calls[0][0]).toBe("https://api.github.com/repos/openai/example/releases?per_page=10");
    expect(adapter.normalize(item, input)).toMatchObject({ externalId: "12345", author: "maintainer", normalizedContent: "Adds structured output.", sourceType: "GitHub" });
  });

  it("collects YouTube RSS metadata without creating transcript claims", async () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Channel</title><entry><id>yt:video:abc123</id><title>AI demo</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><author><name>Channel Author</name></author><published>2026-09-04T10:00:00Z</published><media:group><media:description>Official video description.</media:description></media:group></entry></feed>`;
    const http = vi.fn<PublicHttpClient>(async () => result(xml));
    const adapter = createAdapterRegistry({ http }).get("YouTube")!;
    const input = source("YouTube", "UCabcdefghijklmnopqrstuv");
    const [item] = await adapter.discover(input);
    expect(http.mock.calls[0][0]).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv");
    expect(adapter.normalize(item, input)).toMatchObject({ normalizedContent: "Official video description.", author: "Channel Author", sourceType: "YouTube" });
  });

  it("fails clearly without X credentials and performs no network request", async () => {
    const http = vi.fn<PublicHttpClient>();
    await expect(createAdapterRegistry({ http, env: {} }).get("X")!.discover(source("X", "openai"))).rejects.toThrow(/X_BEARER_TOKEN/);
    expect(http).not.toHaveBeenCalled();
  });

  it("collects an official X timeline using bearer credentials", async () => {
    const http = vi.fn<PublicHttpClient>()
      .mockResolvedValueOnce(result(JSON.stringify({ data: { id: "123", username: "openai" } })))
      .mockResolvedValueOnce(result(JSON.stringify({ data: [{ id: "456", text: "New model announced.", created_at: "2026-09-04T12:00:00Z", lang: "en" }] })));
    const adapter = createAdapterRegistry({ http, env: { X_BEARER_TOKEN: "fixture-token" } }).get("X")!;
    const input = source("X", "@openai");
    const [item] = await adapter.discover(input);
    expect(http.mock.calls[0][1]?.headers?.authorization).toBe("Bearer fixture-token");
    expect(adapter.normalize(item, input)).toMatchObject({ externalId: "456", url: "https://x.com/openai/status/456", author: "@openai", normalizedContent: "New model announced." });
  });

  it("validates identifiers before they enter API URLs", () => {
    expect(() => validateSourceLocation("GitHub", "owner/repo?token=bad")).toThrow();
    expect(() => validateSourceLocation("GitHub", "https://evil.example.com/owner/repo")).toThrow();
    expect(() => validateSourceLocation("YouTube", "@somehandle")).toThrow(/UC channel ID/);
    expect(() => validateSourceLocation("X", "openai/../../users")).toThrow();
    expect(() => validateSourceLocation("RSS", "http://127.0.0.1/feed")).toThrow();
    expect(() => validateSourceLocation("Paper", "cat:cs.AI")).not.toThrow();
  });

  it("decodes text entities without retaining executable HTML", () => {
    expect(plainText("&lt;script&gt;bad()&lt;/script&gt;<p>A &amp; B &#x1F680;</p>")).toBe("A & B 🚀");
  });
});
