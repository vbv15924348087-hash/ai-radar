import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, SourceAdapter } from "@/application/ports";
import { SourceSyncService, SyncBusyError } from "@/application/ingestion/source-sync-service";
import type { ContentItem } from "@/domain/content";
import type { Analysis } from "@/domain/intelligence";
import type { Source } from "@/domain/source";
import { openDatabase, type RadarDatabase } from "@/infrastructure/db/connection";
import { SqliteRadarRepository } from "@/infrastructure/db/repository";

function analysisFor(content: ContentItem): Analysis {
  return { summary: "Agent 增加记忆能力。", whyItMatters: "符合关注主题。", keyChanges: ["提供本地存储。"],
    productImpact: "可验证本地记忆方案。", evidence: [{ quote: content.normalizedContent.slice(0, 120), url: content.url }],
    topics: ["agent", "memory"], relevanceScore: 90, importanceScore: 80, noveltyScore: 70, sourceQualityScore: 80 };
}

function makeAdapter(overrides: Partial<SourceAdapter> = {}): SourceAdapter {
  return {
    discover: vi.fn(async source => [{ externalId: "release-1", url: `${source.urlOrIdentifier}/release?utm_source=rss`, payload: null }]),
    fetch: vi.fn(async raw => ({ ...raw, payload: "<p>Agent memory adds local storage.</p>" })),
    normalize: vi.fn((raw, source) => ({ sourceId: source.id, sourceType: source.type, externalId: raw.externalId,
      title: "Agent memory release", author: "Maintainers", url: raw.url, publishedAt: "2026-09-05T00:00:00.000Z",
      rawContent: String(raw.payload), normalizedContent: "Agent memory adds local storage.", language: "en", fetchedAt: new Date().toISOString() })),
    ...overrides,
  };
}

function makeProvider(name = "test"): AIProvider {
  return { name, version: `${name}-1`, analyze: vi.fn(async content => analysisFor(content)) };
}

describe("SourceSyncService with a real SQLite repository", () => {
  let connection: RadarDatabase;
  let repository: SqliteRadarRepository;
  let source: Source;
  beforeEach(() => {
    connection = openDatabase(":memory:");
    repository = new SqliteRadarRepository(connection);
    source = repository.addSource({ name: "Fixture RSS", type: "RSS", urlOrIdentifier: "https://example.com", enabled: true, priority: 4, metadata: {} });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => { connection.close(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("ingests, normalizes, classifies, ranks, and completes durable intelligence", async () => {
    const adapter = makeAdapter();
    const provider = makeProvider();
    const service = new SourceSyncService(repository, new Map([["RSS", adapter]]), provider);
    const [run] = await service.sync({ sourceId: source.id });
    expect(run).toMatchObject({ state: "completed", discovered: 1, fetched: 1, analyzed: 1, failed: 0, duplicates: 0, errors: [] });
    const item = repository.feed({}).items[0];
    expect(item.content).toMatchObject({ state: "completed", attempts: 1, rawContent: "<p>Agent memory adds local storage.</p>",
      normalizedContent: "Agent memory adds local storage.", canonicalUrl: "https://example.com/release" });
    expect(item).toMatchObject({ finalScore: 82, provider: "test", processingVersion: "test-1/ranking-1", observationCount: 1 });
    expect(provider.analyze).toHaveBeenCalledWith(expect.objectContaining({ state: "processing", attempts: 1 }),
      expect.arrayContaining([expect.objectContaining({ id: "agent" })]),
      expect.arrayContaining([expect.objectContaining({ topic: expect.objectContaining({ id: "memory" }) })]));
    expect(repository.listRuns()).toHaveLength(1);
    expect(repository.getSource(source.id)?.lastCheckedAt).toBeTruthy();
  });

  it.each([[429, true], [500, true], [401, false]] as const)("classifies HTTP %i retryability independently of configuration advice", async (status, retryable) => {
    const provider = makeProvider();
    provider.analyze = async () => { throw new Error(`OpenAI 请求失败（HTTP ${status}），请检查凭据、额度与模型配置`); };
    const [run] = await new SourceSyncService(repository, new Map([["RSS", makeAdapter()]]), provider).sync();
    expect(run.errors[0]).toMatchObject({ stage: "summarize", retryable, attempts: 1 });
  });

  it("does not reanalyze completed duplicate content on repeated sync", async () => {
    const provider = makeProvider();
    const service = new SourceSyncService(repository, new Map([["RSS", makeAdapter()]]), provider);
    await service.sync();
    const [repeat] = await service.sync();
    expect(repeat).toMatchObject({ discovered: 1, fetched: 1, duplicates: 1, analyzed: 0, failed: 0 });
    expect(repository.feed({}).total).toBe(1);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    const item = repository.feed({}).items[0];
    expect(item.content.attempts).toBe(1);
    expect(repository.observations(item.content.id)).toHaveLength(1);
  });

  it("accepts an original evidence quote cited using the canonical source URL", async () => {
    const provider = makeProvider();
    provider.analyze = vi.fn(async content => ({ ...analysisFor(content), evidence: [{ quote: content.normalizedContent, url: content.canonicalUrl }] }));
    const [run] = await new SourceSyncService(repository, new Map([["RSS", makeAdapter()]]), provider).sync();
    expect(run.state).toBe("completed");
    expect(repository.feed({}).items[0].evidence[0].url).toBe("https://example.com/release");
  });

  it("isolates source discovery failure and still syncs enabled healthy sources", async () => {
    const healthy = repository.addSource({ name: "Healthy", type: "RSS", urlOrIdentifier: "https://healthy.example", enabled: true, priority: 3, metadata: {} });
    const disabled = repository.addSource({ name: "Disabled", type: "RSS", urlOrIdentifier: "https://disabled.example", enabled: false, priority: 5, metadata: {} });
    const adapter = makeAdapter({ discover: vi.fn(async current => {
      if (current.id === source.id) throw new Error("temporary network outage");
      return [{ externalId: "healthy-1", url: `${current.urlOrIdentifier}/release`, payload: null }];
    }) });
    const runs = await new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider()).sync();
    expect(runs).toHaveLength(2);
    expect(runs.find(run => run.sourceId === source.id)).toMatchObject({ state: "failed", failed: 1, errors: [expect.objectContaining({ stage: "discover", retryable: true })] });
    expect(runs.find(run => run.sourceId === healthy.id)?.state).toBe("completed");
    expect(runs.some(run => run.sourceId === disabled.id)).toBe(false);
    expect(repository.getSource(source.id)?.lastError).toBe("temporary network outage");
    expect(repository.feed({}).total).toBe(1);
  });

  it("retains raw content and failed stage/attempts after malformed AI output, then retries without fetching", async () => {
    const adapter = makeAdapter();
    const provider = makeProvider();
    provider.analyze = vi.fn(async () => ({ summary: "missing mandatory fields" }) as unknown as Analysis);
    const service = new SourceSyncService(repository, new Map([["RSS", adapter]]), provider);
    const [failed] = await service.sync();
    expect(failed).toMatchObject({ state: "failed", analyzed: 0, failed: 1 });
    expect(failed.errors[0]).toMatchObject({ stage: "summarize", attempts: 1, externalId: "release-1", retryable: true });
    const id = failed.errors[0].contentItemId!;
    expect(repository.getContent(id)).toMatchObject({ state: "failed", attempts: 1, rawContent: "<p>Agent memory adds local storage.</p>" });
    expect(repository.observations(id)).toHaveLength(1);
    expect(repository.feed({}).total).toBe(0);
    provider.analyze = vi.fn(async content => analysisFor(content));
    const [retried] = await service.sync({ sourceId: source.id, retry: true });
    expect(retried).toMatchObject({ state: "completed", discovered: 0, fetched: 0, analyzed: 1, failed: 0 });
    expect(repository.getContent(id)).toMatchObject({ state: "completed", attempts: 2, error: null });
    expect(adapter.fetch).toHaveBeenCalledTimes(1);
    expect(repository.getSource(source.id)?.lastError).toBeNull();
  });

  it("rejects fabricated evidence while retaining the normalized source", async () => {
    const provider = makeProvider();
    provider.analyze = vi.fn(async content => ({ ...analysisFor(content), evidence: [{ quote: "Unsupported 10x benchmark", url: content.url }] }));
    const [run] = await new SourceSyncService(repository, new Map([["RSS", makeAdapter()]]), provider).sync();
    expect(run.errors[0].stage).toBe("summarize");
    expect(repository.getContent(run.errors[0].contentItemId!)?.normalizedContent).toBe("Agent memory adds local storage.");
    expect(repository.feed({}).total).toBe(0);
  });

  it("preserves read/favorite flags while upgrading completed development analyses", async () => {
    const adapter = makeAdapter();
    await new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider("development")).sync();
    const id = repository.feed({}).items[0].contentItemId;
    repository.updateItem(id, { favorite: true, read: true });
    const provider = makeProvider("openai-test");
    const [run] = await new SourceSyncService(repository, new Map([["RSS", adapter]]), provider).sync({ retry: true });
    expect(run).toMatchObject({ analyzed: 1, fetched: 0, state: "completed" });
    expect(repository.getItem(id)).toMatchObject({ provider: "openai-test", favorite: true, read: true, content: { attempts: 2, state: "completed" } });
  });

  it("records a failed item fetch and continues to the next item", async () => {
    const adapter = makeAdapter({
      discover: vi.fn(async () => ["bad", "good"].map(externalId => ({ externalId, url: `https://example.com/${externalId}`, payload: null }))),
      fetch: vi.fn(async raw => { if (raw.externalId === "bad") throw new Error("fetch temporarily failed"); return { ...raw, payload: "original good source" }; }),
    });
    const [run] = await new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider()).sync();
    expect(run).toMatchObject({ discovered: 2, fetched: 1, analyzed: 1, failed: 1 });
    expect(run.errors[0]).toMatchObject({ stage: "fetch", externalId: "bad" });
    expect(repository.feed({}).items[0].content.externalId).toBe("good");
  });

  it("rediscovers after an initial discovery failure and retry reaches completed intelligence", async () => {
    const discover = vi.fn<SourceAdapter["discover"]>().mockRejectedValueOnce(new Error("temporary discovery outage"))
      .mockResolvedValue([{ externalId: "after-retry", url: "https://example.com/recovered", payload: null }]);
    const adapter = makeAdapter({ discover });
    const service = new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider());
    expect((await service.sync())[0]).toMatchObject({ state: "failed", discovered: 0, errors: [expect.objectContaining({ stage: "discover", attempts: 1 })] });
    const [retried] = await service.sync({ retry: true, sourceId: source.id });
    expect(retried).toMatchObject({ state: "completed", discovered: 1, fetched: 1, analyzed: 1, failed: 0 });
    expect(discover).toHaveBeenCalledTimes(2);
    expect(repository.feed({}).items[0].content.externalId).toBe("after-retry");
    expect(repository.getSource(source.id)?.lastError).toBeNull();
  });

  it("rediscovers and retries an item that failed before normalized persistence", async () => {
    const fetch = vi.fn<SourceAdapter["fetch"]>().mockRejectedValueOnce(new Error("temporary fetch outage"))
      .mockImplementation(async raw => ({ ...raw, payload: "retained source text" }));
    const service = new SourceSyncService(repository, new Map([["RSS", makeAdapter({ fetch })]]), makeProvider());
    const [failed] = await service.sync();
    expect(failed.errors[0]).toMatchObject({ stage: "fetch", attempts: 1, externalId: "release-1" });
    expect(failed.errors[0].contentItemId).toBeUndefined();
    expect((await service.sync({ retry: true }))[0]).toMatchObject({ state: "completed", fetched: 1, analyzed: 1 });
    expect(repository.feed({}).items[0].content.rawContent).toBe("retained source text");
  });

  it("increments repeated pre-persistence failure attempts even when runs share a millisecond", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T03:00:00.000Z"));
    const adapter = makeAdapter({ discover: vi.fn(async () => { throw new Error("temporary outage"); }) });
    const service = new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider());
    const first = (await service.sync())[0];
    const second = (await service.sync({ retry: true }))[0];
    const third = (await service.sync({ retry: true }))[0];
    expect([first.errors[0].attempts, second.errors[0].attempts, third.errors[0].attempts]).toEqual([1, 2, 3]);
    expect(repository.listRuns()[0].id).toBe(third.id);
  });

  it("does not retry a failed duplicate twice within one discovery batch", async () => {
    const adapter = makeAdapter({ discover: vi.fn(async () => ["first", "second"].map(externalId => ({ externalId, url: "https://example.com/same", payload: null }))) });
    const provider = makeProvider();
    provider.analyze = vi.fn(async () => { throw new Error("model temporarily unavailable"); });
    const [run] = await new SourceSyncService(repository, new Map([["RSS", adapter]]), provider).sync();
    expect(run).toMatchObject({ discovered: 2, duplicates: 1, analyzed: 0, failed: 1 });
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(repository.getContent(run.errors[0].contentItemId!)?.attempts).toBe(1);
    expect(repository.observations(run.errors[0].contentItemId!)).toHaveLength(2);
  });

  it("prevents simultaneous syncs and releases its lock after completion", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const adapter = makeAdapter({ discover: vi.fn(async () => { entered(); await gate; return []; }) });
    const service = new SourceSyncService(repository, new Map([["RSS", adapter]]), makeProvider());
    const first = service.sync();
    await started;
    await expect(service.sync()).rejects.toBeInstanceOf(SyncBusyError);
    release();
    expect((await first)[0].state).toBe("completed");
    expect(repository.acquireLock("after-completion")).toBe(true);
    repository.releaseLock("after-completion");
  });
});
