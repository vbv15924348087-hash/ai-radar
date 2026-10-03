import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeUrl, contentFingerprint, deduplicateContent } from "@/application/ingestion/deduplicate";
import type { ContentDraft } from "@/domain/content";
import type { Source } from "@/domain/source";
import { openDatabase, type RadarDatabase } from "@/infrastructure/db/connection";
import { SqliteRadarRepository } from "@/infrastructure/db/repository";

function draft(source: Source, overrides: Partial<ContentDraft> = {}): ContentDraft {
  return { sourceId: source.id, sourceType: source.type, externalId: "external-1", title: "Agent memory release",
    author: "Maintainers", url: "https://example.com/release?utm_source=newsletter", publishedAt: null,
    rawContent: "<p>Agent memory</p>", normalizedContent: "Agent memory is available.", language: "en",
    fetchedAt: "2026-09-05T00:00:00.000Z", ...overrides };
}

describe("canonical URL and fingerprints", () => {
  it("removes tracking and fragments while retaining identity parameters in a stable order", () => {
    expect(canonicalizeUrl("https://EXAMPLE.com:443/releases/?z=2&utm_source=rss&a=1&fbclid=x#details"))
      .toBe("https://example.com/releases?a=1&z=2");
    expect(canonicalizeUrl("https://example.com/item?id=1")).not.toBe(canonicalizeUrl("https://example.com/item?id=2"));
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });
  it("rejects non-web URLs and embedded credentials", () => {
    for (const url of ["javascript:alert(1)", "file:///secret", "https://user:password@example.com/item", "not a URL"]) {
      expect(() => canonicalizeUrl(url)).toThrow();
    }
  });
  it("normalizes whitespace, case and compatibility characters in substantial source text", () => {
    const body = "Agent memory uses local storage. ".repeat(5);
    expect(contentFingerprint({ title: "Original", normalizedContent: body }))
      .toBe(contentFingerprint({ title: "Syndicated", normalizedContent: body.replace(/Agent/g, "ＡＧＥＮＴ").replace(/ /g, "\n  ") }));
  });
  it("uses titles to avoid merging unrelated short generic summaries", () => {
    expect(contentFingerprint({ title: "Release A", normalizedContent: "Read more" }))
      .not.toBe(contentFingerprint({ title: "Release B", normalizedContent: "Read more" }));
  });
});

describe("deduplication against real SQLite persistence", () => {
  let connection: RadarDatabase;
  let repository: SqliteRadarRepository;
  let firstSource: Source;
  let secondSource: Source;
  beforeEach(() => {
    connection = openDatabase(":memory:");
    repository = new SqliteRadarRepository(connection);
    firstSource = repository.addSource({ name: "RSS", type: "RSS", urlOrIdentifier: "https://example.com/rss", enabled: true, priority: 3, metadata: {} });
    secondSource = repository.addSource({ name: "Blog", type: "Blog", urlOrIdentifier: "https://blog.example/rss", enabled: true, priority: 3, metadata: {} });
  });
  afterEach(() => connection.close());

  it("persists a pending content record and raw observation together", async () => {
    const input = draft(firstSource);
    const result = await deduplicateContent(repository, input);
    expect(result).toMatchObject({ duplicate: false, content: { state: "pending", attempts: 0, error: null, eventId: null } });
    expect(repository.getContent(result.content.id)?.rawContent).toBe(input.rawContent);
    expect(repository.observations(result.content.id)[0]).toMatchObject({ sourceId: firstSource.id, externalId: input.externalId, rawContent: input.rawContent, url: input.url });
  });

  it("recognizes repeated external identity even when its URL/text changes, without multiplying observations", async () => {
    const original = await deduplicateContent(repository, draft(firstSource));
    const repeat = await deduplicateContent(repository, draft(firstSource, { url: "https://example.com/moved", title: "Changed", normalizedContent: "Changed article" }));
    expect(repeat.duplicate).toBe(true);
    expect(repeat.content.id).toBe(original.content.id);
    expect(repository.observations(original.content.id)).toHaveLength(1);
    expect(repository.getContent(original.content.id)?.title).toBe("Agent memory release");
  });

  it("deduplicates tracked canonical URLs across sources while preserving both observations", async () => {
    const original = await deduplicateContent(repository, draft(firstSource));
    const syndicated = draft(secondSource, { externalId: "blog-8", url: "https://example.com/release?utm_campaign=weekly#intro", rawContent: "<p>A second RSS excerpt</p>", normalizedContent: "Second excerpt differs" });
    const repeat = await deduplicateContent(repository, syndicated);
    expect(repeat.content.id).toBe(original.content.id);
    expect(repeat.duplicate).toBe(true);
    expect(repository.observations(original.content.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: firstSource.id, rawContent: "<p>Agent memory</p>" }),
      expect.objectContaining({ sourceId: secondSource.id, externalId: "blog-8", rawContent: syndicated.rawContent, url: syndicated.url }),
    ]));
    const seenAgain = await deduplicateContent(repository, { ...syndicated, url: "https://blog.example/redirected", normalizedContent: "Changed again" });
    expect(seenAgain.content.id).toBe(original.content.id);
    expect(repository.observations(original.content.id)).toHaveLength(2);
  });

  it("deduplicates substantial identical text at different URLs and titles", async () => {
    const text = "Agent memory uses local storage and records every observation with evidence. ".repeat(3);
    const original = await deduplicateContent(repository, draft(firstSource, { normalizedContent: text }));
    const repeat = await deduplicateContent(repository, draft(secondSource, { externalId: "copy-1", title: "Syndication", url: "https://blog.example/copy", normalizedContent: text.toUpperCase() }));
    expect(repeat).toMatchObject({ duplicate: true, content: { id: original.content.id } });
    expect(repository.observations(original.content.id)).toHaveLength(2);
  });

  it("keeps unrelated articles with a generic short snippet and same cross-source external ID", async () => {
    const one = await deduplicateContent(repository, draft(firstSource, { title: "Release A", normalizedContent: "Read more" }));
    const two = await deduplicateContent(repository, draft(secondSource, { title: "Release B", url: "https://blog.example/b", normalizedContent: "Read more" }));
    expect(two.duplicate).toBe(false);
    expect(two.content.id).not.toBe(one.content.id);
  });

  it("uses the semantic extension only after exact deduplication and keeps evidence", async () => {
    const original = await deduplicateContent(repository, draft(firstSource));
    const semantic = { findSimilar: vi.fn(async () => original.content.id) };
    await deduplicateContent(repository, draft(firstSource), semantic);
    expect(semantic.findSimilar).not.toHaveBeenCalled();
    const similar = await deduplicateContent(repository, draft(secondSource, { title: "Related report", externalId: "related-2", url: "https://blog.example/related", normalizedContent: "Related but different text" }), semantic);
    expect(semantic.findSimilar).toHaveBeenCalledTimes(1);
    expect(similar.content.id).toBe(original.content.id);
    expect(repository.observations(original.content.id)).toHaveLength(2);
  });

  it("rejects unprocessable drafts before persistence", async () => {
    for (const changes of [{ title: " " }, { externalId: "" }, { normalizedContent: " " }]) {
      await expect(deduplicateContent(repository, draft(firstSource, changes))).rejects.toThrow(/缺少/);
    }
    expect(connection.sqlite.prepare("SELECT count(*) AS count FROM contents").get()).toEqual({ count: 0 });
  });
});
