import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/domain/content";
import type { IntelligenceItem } from "@/domain/intelligence";
import type { Source } from "@/domain/source";
import type { SyncRun } from "@/domain/sync";
import { openDatabase, type RadarDatabase } from "@/infrastructure/db/connection";
import { SqliteRadarRepository } from "@/infrastructure/db/repository";
import { endOfDay, startOfDay } from "@/application/time";

function content(source: Source, id: string, changes: Partial<ContentItem> = {}): ContentItem {
  return { id, sourceId: source.id, sourceType: source.type, externalId: `external-${id}`, title: `Agent release ${id}`,
    author: "Maintainers", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`,
    publishedAt: "2026-09-05T01:00:00.000Z", fetchedAt: "2026-09-05T02:00:00.000Z", rawContent: "<p>Agent memory release</p>",
    normalizedContent: "Agent memory release", language: "en", fingerprint: `fingerprint-${id}`, state: "pending", attempts: 0, error: null, eventId: null, ...changes };
}

function intelligence(item: ContentItem, changes: Partial<IntelligenceItem> = {}): IntelligenceItem {
  return { contentItemId: item.id, summary: `摘要 ${item.id}`, whyItMatters: "主题关联", keyChanges: ["变化"], productImpact: "产品影响",
    evidence: [{ quote: item.normalizedContent, url: item.url }], topics: ["agent"], relevanceScore: 90,
    importanceScore: 70, noveltyScore: 60, sourceQualityScore: 80, finalScore: 78,
    provider: "test", processingVersion: "test-1", createdAt: "2026-09-05T02:00:00.000Z", favorite: false, read: false, ...changes };
}

function run(source: Source, changes: Partial<SyncRun> = {}): SyncRun {
  return { id: "run-1", sourceId: source.id, state: "processing", startedAt: "2026-09-05T02:00:00.000Z", finishedAt: null,
    durationMs: 0, discovered: 1, fetched: 1, duplicates: 0, analyzed: 0, failed: 0, aiDurationMs: 0, errors: [], ...changes };
}

describe("SQLite repository persistence and library", () => {
  let connection: RadarDatabase;
  let repository: SqliteRadarRepository;
  let source: Source;
  beforeEach(() => {
    connection = openDatabase(":memory:");
    repository = new SqliteRadarRepository(connection);
    source = repository.addSource({ name: "Original RSS", type: "RSS", urlOrIdentifier: "https://example.com/rss", enabled: true, priority: 3, metadata: {} });
  });
  afterEach(() => { connection.close(); vi.useRealTimers(); });

  function complete(item: ContentItem, changes: Partial<IntelligenceItem> = {}) {
    repository.insertContent(item);
    repository.observe(item.id, item);
    repository.transitionContent(item.id, "processing");
    repository.saveIntelligence(intelligence(item, changes));
    return item.id;
  }

  it("applies legal state transitions and increments attempts only upon entering processing", () => {
    const item = content(source, "states");
    repository.insertContent(item);
    expect(repository.getContent(item.id)).toMatchObject({ state: "pending", attempts: 0 });
    expect(() => repository.transitionContent(item.id, "completed")).toThrow(/非法/);
    expect(repository.transitionContent(item.id, "processing")).toMatchObject({ state: "processing", attempts: 1 });
    expect(() => repository.transitionContent(item.id, "processing")).toThrow(/非法/);
    expect(repository.transitionContent(item.id, "failed", "temporary failure")).toMatchObject({ state: "failed", attempts: 1, error: "temporary failure" });
    expect(repository.transitionContent(item.id, "processing")).toMatchObject({ state: "processing", attempts: 2, error: null });
    repository.saveIntelligence(intelligence(item));
    expect(repository.getContent(item.id)).toMatchObject({ state: "completed", attempts: 2, error: null });
    expect(() => repository.transitionContent(item.id, "pending")).toThrow(/非法/);
    expect(repository.transitionContent(item.id, "processing").attempts).toBe(3);
  });

  it("does not insert intelligence unless the content is processing", () => {
    const item = content(source, "atomic");
    repository.insertContent(item);
    expect(() => repository.saveIntelligence(intelligence(item))).toThrow(/非法/);
    expect(repository.feed({}).total).toBe(0);
    expect(repository.getContent(item.id)?.state).toBe("pending");
  });

  it("roundtrips nested evidence/topics and preserves user flags during reanalysis", () => {
    const item = content(source, "roundtrip");
    complete(item, { evidence: [{ quote: "Agent memory release", url: item.url }], topics: ["agent", "memory"] });
    repository.updateItem(item.id, { read: true, favorite: true });
    repository.transitionContent(item.id, "processing");
    repository.saveIntelligence(intelligence(item, { summary: "更新后的摘要", favorite: false, read: false, provider: "updated" }));
    expect(repository.getItem(item.id)).toMatchObject({ favorite: true, read: true, summary: "更新后的摘要", provider: "updated", observationCount: 1 });
    expect(repository.feed({ favorite: true }).total).toBe(1);
    expect(repository.feed({ unread: true }).total).toBe(0);
  });

  it("combines filters and escapes SQL wildcard input literally", () => {
    const paper = repository.addSource({ name: "Paper", type: "Paper", urlOrIdentifier: "https://papers.example/rss", enabled: true, priority: 3, metadata: {} });
    complete(content(source, "one", { title: "Agent 100%_real", publishedAt: "2026-09-04T12:00:00.000Z" }), { topics: ["agent"], favorite: true });
    complete(content(paper, "two", { title: "Memory study", publishedAt: "2026-09-05T08:00:00.000Z" }), { topics: ["memory"], summary: "Agent relevance in a paper", read: true });
    complete(content(source, "three", { title: "Agent 100xxreal", publishedAt: null, fetchedAt: "2026-09-06T09:00:00.000Z" }), { topics: ["agent", "memory"] });
    expect(repository.feed({ search: "100%_real" }).items.map(item => item.content.id)).toEqual(["one"]);
    expect(repository.feed({ search: "Agent", topic: "memory", sourceType: "Paper" }).items.map(item => item.content.id)).toEqual(["two"]);
    expect(repository.feed({ topic: "agent", favorite: true, unread: true }).items.map(item => item.content.id)).toEqual(["one"]);
    expect(repository.feed({ from: "2026-09-05T00:00:00.000Z", to: "2026-09-05T23:59:59.999Z" }).items.map(item => item.content.id)).toEqual(["two"]);
    expect(repository.feed({ from: "2026-09-06T00:00:00.000Z" }).items.map(item => item.content.id)).toEqual(["three"]);
    expect(repository.feed({ search: "' OR 1=1 --" }).total).toBe(0);
    expect(repository.feed({ topic: "mem" }).total).toBe(0);
  });

  it("orders by score, processing time and ID so pagination is stable across ties", () => {
    complete(content(source, "a"), { finalScore: 70 });
    complete(content(source, "b"), { finalScore: 70 });
    complete(content(source, "c"), { finalScore: 90, createdAt: "2026-09-04T00:00:00.000Z" });
    complete(content(source, "d"), { finalScore: 70, createdAt: "2026-09-05T04:00:00.000Z" });
    const first = repository.feed({ limit: 2 });
    const second = repository.feed({ limit: 2, offset: 2 });
    expect(first.total).toBe(4);
    expect(first.items.map(item => item.content.id)).toEqual(["c", "d"]);
    expect(second.items.map(item => item.content.id)).toEqual(["b", "a"]);
    expect(repository.feed({ limit: 2, offset: 2 })).toEqual(second);
    expect(repository.feed({ offset: 20 })).toEqual({ total: 4, items: [] });
  });

  it("prefers newer publication dates at the same score even when old backlog was processed last", () => {
    complete(content(source, "new", { publishedAt: "2026-09-05T00:00:00.000Z" }), { createdAt: "2026-09-05T01:00:00.000Z" });
    complete(content(source, "old", { publishedAt: "2026-08-01T00:00:00.000Z" }), { createdAt: "2026-09-05T03:00:00.000Z" });
    expect(repository.feed({}).items.map(item => item.content.id)).toEqual(["new", "old"]);
  });

  it("preserves historical library items and raw observations when a source is deleted", () => {
    complete(content(source, "history"));
    repository.deleteSource(source.id);
    expect(repository.listSources()).toEqual([]);
    expect(repository.getSource(source.id)).toBeUndefined();
    expect(repository.feed({}).items[0]).toMatchObject({ sourceName: "Original RSS", contentItemId: "history", observationCount: 1 });
    expect(repository.observations("history")[0].rawContent).toBe("<p>Agent memory release</p>");
    expect(() => repository.updateSource(source.id, { enabled: true })).toThrow(/不存在/);
  });

  it("protects source identity after observations exist while allowing metadata edits", () => {
    repository.updateSource(source.id, { urlOrIdentifier: "https://example.com/new-feed" });
    complete(content(source, "source-identity"));
    expect(() => repository.updateSource(source.id, { type: "Paper" })).toThrow(/不能更换/);
    expect(() => repository.updateSource(source.id, { urlOrIdentifier: "https://another.example/feed" })).toThrow(/不能更换/);
    expect(repository.updateSource(source.id, { name: "Renamed", priority: 5, enabled: false })).toMatchObject({ name: "Renamed", priority: 5, enabled: false });
    expect(repository.getItem("source-identity")?.sourceName).toBe("Renamed");
  });

  it("identifies pending/failed retries and optional development upgrades without replaying completed production content", () => {
    const pending = content(source, "pending");
    repository.insertContent(pending);
    repository.insertContent(content(source, "failed"));
    repository.transitionContent("failed", "failed", "fetch unavailable");
    complete(content(source, "development"), { provider: "development" });
    complete(content(source, "production"), { provider: "openai" });
    expect(repository.retryableContents(source.id).map(item => item.id).sort()).toEqual(["failed", "pending"]);
    expect(repository.retryableContents(source.id, true).map(item => item.id).sort()).toEqual(["development", "failed", "pending"]);
  });

  it("keeps recently processed old publications in Today using processing date", () => {
    complete(content(source, "old-news", { publishedAt: "2026-08-01T00:00:00.000Z", fetchedAt: "2026-09-04T17:00:00.000Z" }), { createdAt: "2026-09-04T17:01:00.000Z", finalScore: 85 });
    complete(content(source, "yesterday", { fetchedAt: "2026-09-04T15:00:00.000Z" }), { createdAt: "2026-09-04T15:01:00.000Z" });
    repository.saveRun(run(source, { id: "today-run", state: "completed", startedAt: "2026-09-04T17:00:00.000Z", discovered: 7, analyzed: 1 }));
    repository.saveRun(run(source, { id: "yesterday-run", state: "completed", startedAt: "2026-09-04T15:00:00.000Z", discovered: 12, analyzed: 1 }));
    const since = "2026-09-04T16:00:00.000Z";
    expect(repository.feed({ processedFrom: since }).items.map(item => item.content.id)).toEqual(["old-news"]);
    expect(repository.dailyMetrics(since)).toEqual({ scanned: 7, unique: 1, relevant: 1, worthRead: 1, mustRead: 1 });
  });

  it("includes both local date boundaries and excludes adjacent days during a DST transition", () => {
    complete(content(source, "before", { publishedAt: "2026-03-08T04:59:59.999Z" }));
    complete(content(source, "start", { publishedAt: "2026-03-08T05:00:00.000Z" }));
    complete(content(source, "end", { publishedAt: "2026-03-09T03:59:59.999Z" }));
    complete(content(source, "after", { publishedAt: "2026-03-09T04:00:00.000Z" }));
    const date = "2026-03-08";
    const result = repository.feed({ from: startOfDay(date, "America/New_York"), to: endOfDay(date, "America/New_York") });
    expect(result.items.map(item => item.content.id).sort()).toEqual(["end", "start"]);
    expect(result.total).toBe(2);
  });

  it("enforces lock ownership and recovers interrupted content/runs after the lease expires", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"));
    expect(repository.acquireLock("owner-1")).toBe(true);
    repository.insertContent(content(source, "interrupted"));
    repository.transitionContent("interrupted", "processing");
    repository.saveRun(run(source));
    expect(repository.acquireLock("owner-2")).toBe(false);
    repository.releaseLock("owner-2");
    expect(repository.acquireLock("owner-3")).toBe(false);
    expect(() => repository.renewLock("wrong-owner")).toThrow(/失效/);
    vi.setSystemTime(new Date("2026-09-05T02:06:00.000Z"));
    expect(repository.acquireLock("recovered-owner")).toBe(true);
    expect(repository.getContent("interrupted")).toMatchObject({ state: "failed", attempts: 1, error: "上次处理意外中断，可重试" });
    expect(repository.listRuns()[0]).toMatchObject({ state: "failed", failed: 1, finishedAt: "2026-09-05T02:06:00.000Z",
      errors: [expect.objectContaining({ retryable: true, stage: "persist" })] });
    repository.releaseLock("owner-1");
    expect(repository.acquireLock("other")).toBe(false);
    repository.renewLock("recovered-owner");
    repository.releaseLock("recovered-owner");
    expect(repository.acquireLock("other")).toBe(true);
  });

  it("renews a lease so a slow ongoing sync is not recovered prematurely", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"));
    expect(repository.acquireLock("active")).toBe(true);
    vi.setSystemTime(new Date("2026-09-05T02:04:00.000Z"));
    repository.renewLock("active");
    vi.setSystemTime(new Date("2026-09-05T02:06:00.000Z"));
    expect(repository.acquireLock("contender")).toBe(false);
  });
});
