import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/domain/content";
import type { IntelligenceItem } from "@/domain/intelligence";
import type { Source } from "@/domain/source";
import type { SyncRun } from "@/domain/sync";
import { contents, topics } from "@/infrastructure/db/schema";
import { openLibsqlDatabase, readRadarDocument, writeRadarDocument } from "@/infrastructure/db/libsql-connection";
import { LibsqlRadarRepository } from "@/infrastructure/db/libsql-repository";
import { cleanupSqliteTestDirectory } from "./helpers/sqlite-test-cleanup";

function content(source: Source, id: string, changes: Partial<ContentItem> = {}): ContentItem {
  return { id, sourceId: source.id, sourceType: source.type, externalId: `external-${id}`, title: `Agent release ${id}`,
    author: "Maintainers", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`,
    publishedAt: "2026-09-05T01:00:00.000Z", fetchedAt: "2026-09-05T02:00:00.000Z", rawContent: "<p>Agent memory release</p>",
    normalizedContent: "Agent memory release", language: "en", fingerprint: `fingerprint-${id}`, state: "pending", attempts: 0,
    error: null, eventId: null, ...changes };
}

function intelligenceFor(item: ContentItem, changes: Partial<IntelligenceItem> = {}): IntelligenceItem {
  return { contentItemId: item.id, summary: `摘要 ${item.id}`, whyItMatters: "主题关联", keyChanges: ["变化"], productImpact: "产品影响",
    evidence: [{ quote: item.normalizedContent, url: item.url }], topics: ["agent"], relevanceScore: 90,
    importanceScore: 70, noveltyScore: 60, sourceQualityScore: 80, finalScore: 78, provider: "test", processingVersion: "test-1",
    createdAt: "2026-09-05T02:00:00.000Z", favorite: false, read: false, ...changes };
}

function run(source: Source, changes: Partial<SyncRun> = {}): SyncRun {
  return { id: "run-1", sourceId: source.id, state: "processing", startedAt: "2026-09-05T02:00:00.000Z", finishedAt: null,
    durationMs: 0, discovered: 1, fetched: 1, duplicates: 0, analyzed: 0, failed: 0, aiDurationMs: 0, errors: [], ...changes };
}

describe("libSQL repository with a temporary SQLite database", () => {
  let directory: string | undefined;
  let connections: Awaited<ReturnType<typeof openLibsqlDatabase>>[] = [];

  function makeUrl(): string {
    directory = mkdtempSync(join(tmpdir(), "ai-radar-libsql-"));
    return pathToFileURL(join(directory, "radar.sqlite")).href;
  }

  async function openTracked(url: string) {
    const opened = await openLibsqlDatabase(url);
    connections.push(opened);
    return opened;
  }

  afterEach(async () => {
    vi.useRealTimers();
    if (!directory) return;
    await cleanupSqliteTestDirectory(directory, "ai-radar-libsql-", connections);
    connections = [];
    directory = undefined;
  });

  it("initializes the migration and seeds topics once under concurrent opens, then persists documents", async () => {
    const url = makeUrl();
    const [first, second] = await Promise.all([openTracked(url), openTracked(url)]);
    expect(await first.db.select().from(topics).all()).toHaveLength(6);
    expect(await second.db.select().from(topics).all()).toHaveLength(6);
    await new LibsqlRadarRepository(first).deleteTopic("agent");

    const digest = { date: "2026-10-02", title: "每日精选", items: [{ id: "2026-10-02-01" }] };
    const selection = { date: "2026-10-02", selectedIds: ["2026-10-02-01"], angle: "代理可控性", updatedAt: "2026-10-02T12:00:00.000Z" };
    await writeRadarDocument(first.client, "digest", digest.date, digest);
    await writeRadarDocument(first.client, "selection", selection.date, selection);
    await writeRadarDocument(second.client, "selection", selection.date, { ...selection, angle: "更新后的方向" });
    expect(await readRadarDocument(first.client, "digest", digest.date)).toEqual(digest);
    expect(await readRadarDocument(first.client, "selection", selection.date)).toMatchObject({ angle: "更新后的方向" });
    expect(await readRadarDocument(first.client, "selection", "2026-10-01")).toBeUndefined();

    await second.close();
    const reopened = await openTracked(url);
    expect(await reopened.db.select().from(topics).all()).toHaveLength(5);
    expect(await readRadarDocument(reopened.client, "selection", selection.date)).toMatchObject({ angle: "更新后的方向" });
    await reopened.close();
  });

  it("preserves deduplication, JSON search, and user flags across repository operations", async () => {
    const connection = await openTracked(makeUrl());
    const repository = new LibsqlRadarRepository(connection);
    const source = await repository.addSource({ name: "Original RSS", type: "RSS", urlOrIdentifier: "https://example.com/rss",
      enabled: true, priority: 3, metadata: {} });
    const item = content(source, "remote");
    await repository.insertContent(item);
    await repository.observe(item.id, item);
    expect(await repository.findDuplicate(item, item.canonicalUrl, item.fingerprint)).toMatchObject({ id: item.id });
    await repository.transitionContent(item.id, "processing");
    await repository.saveIntelligence(intelligenceFor(item, { topics: ["agent", "memory"] }));
    await repository.updateItem(item.id, { favorite: true, read: true });

    await repository.transitionContent(item.id, "processing");
    await repository.saveIntelligence(intelligenceFor(item, { summary: "重新分析后的摘要", topics: ["agent", "memory"], favorite: false, read: false }));

    expect(await repository.getItem(item.id)).toMatchObject({ favorite: true, read: true, observationCount: 1, summary: "重新分析后的摘要" });
    expect(await repository.feed({ search: "Agent release remote", topic: "memory", favorite: true })).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ content: expect.objectContaining({ id: item.id }), favorite: true })],
    });
    expect(await repository.feed({ search: "100%_missing" })).toMatchObject({ items: [], total: 0 });
    expect(await repository.retryableContents(source.id)).toEqual([]);

    const persisted = await connection.db.select().from(contents).all();
    expect(persisted[0]).toMatchObject({ id: item.id, state: "completed", attempts: 2 });
  });

  it("uses a transactional lease and recovers interrupted work only after expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"));
    const connection = await openTracked(makeUrl());
    const repository = new LibsqlRadarRepository(connection);
    const source = await repository.addSource({ name: "Lease RSS", type: "RSS", urlOrIdentifier: "https://example.com/lease.xml",
      enabled: true, priority: 3, metadata: {} });
    expect(await repository.acquireLock("owner-1")).toBe(true);
    await repository.insertContent(content(source, "interrupted"));
    await repository.transitionContent("interrupted", "processing");
    await repository.saveRun(run(source));
    expect(await repository.acquireLock("owner-2")).toBe(false);
    await expect(repository.renewLock("wrong-owner")).rejects.toThrow(/失效/);

    vi.setSystemTime(new Date("2026-09-05T02:06:00.000Z"));
    expect(await repository.acquireLock("recovered-owner")).toBe(true);
    expect(await repository.getContent("interrupted")).toMatchObject({ state: "failed", attempts: 1, error: "上次处理意外中断，可重试" });
    expect((await repository.listRuns())[0]).toMatchObject({ state: "failed", failed: 1, finishedAt: "2026-09-05T02:06:00.000Z",
      errors: [expect.objectContaining({ retryable: true, stage: "persist" })] });

    await repository.releaseLock("owner-1");
    expect(await repository.acquireLock("other-owner")).toBe(false);
    await repository.renewLock("recovered-owner");
    await repository.releaseLock("recovered-owner");
    expect(await repository.acquireLock("other-owner")).toBe(true);
  });
});
