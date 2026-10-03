import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { RadarRepository } from "@/application/repository";
import type { ContentDraft, ContentItem, ProcessingState } from "@/domain/content";
import type { FeedFilters, IntelligenceItem } from "@/domain/intelligence";
import { sourceInputSchema, type SourceInput } from "@/domain/source";
import { topicInputSchema, type TopicInput } from "@/domain/topic";
import { assertTransition } from "@/domain/processing";
import type { SyncRun } from "@/domain/sync";
import type { RadarDatabase } from "./connection";
import { contents, intelligence, observations, sources, syncRuns, topics } from "./schema";
import { readDailyMetrics, readFeed, readItem } from "./feed-reader";

const LOCK_LEASE_MS = 5 * 60 * 1000;
export class SqliteRadarRepository implements RadarRepository {
  constructor(private readonly connection: RadarDatabase) {}
  private get db() { return this.connection.db; }
  listSources() { return this.db.select().from(sources).where(isNull(sources.deletedAt)).orderBy(desc(sources.priority), sources.createdAt).all(); }
  getSource(id: string) { return this.db.select().from(sources).where(and(eq(sources.id, id), isNull(sources.deletedAt))).get(); }
  addSource(input: SourceInput) {
    const now = new Date().toISOString();
    const source = { ...sourceInputSchema.parse(input), id: randomUUID(), lastCheckedAt: null, lastError: null, createdAt: now, updatedAt: now };
    this.db.insert(sources).values(source).run();
    return source;
  }
  updateSource(id: string, input: Partial<SourceInput>) {
    const existing = this.getSource(id);
    if (!existing) throw new Error("来源不存在");
    if ((input.type && input.type !== existing.type) || (input.urlOrIdentifier && input.urlOrIdentifier !== existing.urlOrIdentifier)) {
      const observed = this.db.select({ id: observations.id }).from(observations).where(eq(observations.sourceId, id)).limit(1).get();
      if (observed) throw new Error("已有采集记录的来源不能更换类型或地址；请新增来源以保留原有证据归属");
    }
    const updated = { ...sourceInputSchema.parse({ ...existing, ...input }), updatedAt: new Date().toISOString() };
    this.db.update(sources).set(updated).where(eq(sources.id, id)).run();
    return { ...existing, ...updated };
  }
  deleteSource(id: string) {
    if (!this.getSource(id)) throw new Error("来源不存在");
    this.db.update(sources).set({ enabled: false, deletedAt: new Date().toISOString() }).where(eq(sources.id, id)).run();
  }
  markSourceChecked(id: string, error: string | null) {
    this.db.update(sources).set({ lastCheckedAt: new Date().toISOString(), lastError: error }).where(eq(sources.id, id)).run();
  }
  listTopics() { return this.db.select().from(topics).orderBy(desc(topics.weight), topics.name).all(); }
  addTopic(input: TopicInput) {
    const topic = { ...topicInputSchema.parse(input), id: randomUUID() };
    this.db.insert(topics).values(topic).run();
    return topic;
  }
  updateTopic(id: string, input: Partial<TopicInput>) {
    const existing = this.db.select().from(topics).where(eq(topics.id, id)).get();
    if (!existing) throw new Error("主题不存在");
    const topic = { ...topicInputSchema.parse({ ...existing, ...input }), id };
    this.db.update(topics).set(topic).where(eq(topics.id, id)).run();
    return topic;
  }
  deleteTopic(id: string) {
    const result = this.db.delete(topics).where(eq(topics.id, id)).run();
    if (!result.changes) throw new Error("主题不存在");
  }
  findDuplicate(draft: ContentDraft, canonicalUrl: string, fingerprint: string) {
    const observation = this.db.select().from(observations).where(and(eq(observations.sourceId, draft.sourceId), eq(observations.externalId, draft.externalId))).get();
    if (observation) return this.getContent(observation.contentItemId);
    return this.db.select().from(contents).where(or(
      and(eq(contents.sourceId, draft.sourceId), eq(contents.externalId, draft.externalId)),
      eq(contents.canonicalUrl, canonicalUrl), eq(contents.fingerprint, fingerprint),
    )).get();
  }
  insertContent(content: ContentItem) { this.db.insert(contents).values(content).run(); }
  getContent(id: string) { return this.db.select().from(contents).where(eq(contents.id, id)).get(); }
  transitionContent(id: string, state: ProcessingState, error?: string) {
    const content = this.getContent(id);
    if (!content) throw new Error("内容不存在");
    assertTransition(content.state, state);
    const updated = { ...content, state, error: error ?? null, attempts: content.attempts + (state === "processing" ? 1 : 0) };
    this.db.update(contents).set(updated).where(eq(contents.id, id)).run();
    return updated;
  }
  retryableContents(sourceId: string, includeDevelopment = false) {
    const rows = this.db.select({ content: contents, provider: intelligence.provider }).from(contents)
      .leftJoin(intelligence, eq(contents.id, intelligence.contentItemId)).where(eq(contents.sourceId, sourceId)).all();
    return rows.filter(row => ["failed", "pending"].includes(row.content.state) || (includeDevelopment && row.provider === "development"))
      .map(row => row.content);
  }
  observe(contentId: string, draft: ContentDraft) {
    this.db.insert(observations).values({ id: randomUUID(), contentItemId: contentId, sourceId: draft.sourceId,
      externalId: draft.externalId, url: draft.url, rawContent: draft.rawContent, observedAt: draft.fetchedAt }).onConflictDoNothing().run();
  }
  observations(contentId: string) { return this.db.select().from(observations).where(eq(observations.contentItemId, contentId)).all(); }
  saveIntelligence(item: IntelligenceItem) {
    this.db.transaction(tx => {
      const content = tx.select().from(contents).where(eq(contents.id, item.contentItemId)).get();
      if (!content) throw new Error("内容不存在");
      assertTransition(content.state, "completed");
      const { favorite: _favorite, read: _read, ...analysis } = item;
      tx.insert(intelligence).values(item).onConflictDoUpdate({ target: intelligence.contentItemId, set: analysis }).run();
      tx.update(contents).set({ state: "completed", error: null }).where(eq(contents.id, item.contentItemId)).run();
    });
  }
  feed(filters: FeedFilters) { return readFeed(this.db, filters); }
  getItem(id: string) { return readItem(this.db, id); }
  updateItem(id: string, flags: { favorite?: boolean; read?: boolean }) {
    if (!this.getItem(id)) throw new Error("情报不存在");
    this.db.update(intelligence).set(flags).where(eq(intelligence.contentItemId, id)).run();
  }
  saveRun(run: SyncRun) { this.db.insert(syncRuns).values(run).onConflictDoUpdate({ target: syncRuns.id, set: run }).run(); }
  listRuns(limit = 50) { return this.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt), sql`sync_runs.rowid DESC`).limit(limit).all(); }
  dailyMetrics(since: string) { return readDailyMetrics(this.db, since); }
  acquireLock(owner: string) {
    return this.connection.sqlite.transaction(() => {
      const now = Date.now();
      this.connection.sqlite.prepare("DELETE FROM sync_locks WHERE expires_at < ?").run(now);
      const inserted = this.connection.sqlite.prepare("INSERT OR IGNORE INTO sync_locks VALUES ('ingestion', ?, ?)").run(owner, now + LOCK_LEASE_MS);
      if (!inserted.changes) return false;
      this.db.update(contents).set({ state: "failed", error: "上次处理意外中断，可重试" }).where(eq(contents.state, "processing")).run();
      const interrupted = this.db.select().from(syncRuns).where(eq(syncRuns.state, "processing")).all();
      for (const run of interrupted) this.saveRun({ ...run, state: "failed", finishedAt: new Date(now).toISOString(),
        failed: run.failed + 1, errors: [...run.errors, { stage: "persist", error: "同步意外中断，已恢复", retryable: true, attempts: 1, timestamp: new Date(now).toISOString() }] });
      return true;
    }).immediate();
  }
  renewLock(owner: string) {
    const result = this.connection.sqlite.prepare("UPDATE sync_locks SET expires_at = ? WHERE name = 'ingestion' AND owner = ?").run(Date.now() + LOCK_LEASE_MS, owner);
    if (!result.changes) throw new Error("同步锁已失效，请重新同步");
  }
  releaseLock(owner: string) { this.connection.sqlite.prepare("DELETE FROM sync_locks WHERE name = 'ingestion' AND owner = ?").run(owner); }
}
