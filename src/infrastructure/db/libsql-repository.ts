import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Transaction, Row } from "@libsql/client";
import type { RadarRepository } from "@/application/repository";
import type { ContentDraft, ContentItem, ProcessingState } from "@/domain/content";
import type { FeedFilters, IntelligenceItem } from "@/domain/intelligence";
import { sourceInputSchema, type SourceInput } from "@/domain/source";
import { topicInputSchema, type TopicInput } from "@/domain/topic";
import { assertTransition } from "@/domain/processing";
import type { ProcessingFailure, SyncRun } from "@/domain/sync";
import type { LibsqlRadarConnection } from "./libsql-connection";
import { contents, intelligence, observations, sources, syncRuns, topics } from "./schema";
import { readLibsqlDailyMetrics, readLibsqlFeed, readLibsqlItem } from "./libsql-feed-reader";

const LOCK_LEASE_MS = 5 * 60 * 1000;
const LOCK_RETRY_COUNT = 5;
const delay = (milliseconds: number) => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

function isRetryableLockError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = String(record.code ?? "");
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_(BUSY|LOCKED)|database is locked|write conflict|transaction conflict/i.test(`${code} ${message}`);
}

async function withWriteTransaction<T>(connection: LibsqlRadarConnection, action: (transaction: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt++) {
    let transaction: Transaction | undefined;
    try {
      transaction = await connection.client.transaction("write");
      const result = await action(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      try { await transaction?.rollback(); } catch { /* The transaction may already be closed. */ }
      if (attempt === LOCK_RETRY_COUNT || !isRetryableLockError(error)) throw error;
      await delay(20 * 2 ** attempt);
    } finally {
      transaction?.close();
    }
  }
  throw new Error("无法完成数据库写事务");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function asNumber(value: unknown): number { return Number(value ?? 0); }

function readSyncRun(row: Row): SyncRun {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    state: String(row.state) as SyncRun["state"],
    startedAt: String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at),
    durationMs: asNumber(row.duration_ms),
    discovered: asNumber(row.discovered),
    fetched: asNumber(row.fetched),
    duplicates: asNumber(row.duplicates),
    analyzed: asNumber(row.analyzed),
    failed: asNumber(row.failed),
    aiDurationMs: asNumber(row.ai_duration_ms),
    errors: parseJson<ProcessingFailure[]>(row.errors, []),
  };
}

export class LibsqlRadarRepository implements RadarRepository {
  constructor(private readonly connection: LibsqlRadarConnection) {}
  private get db() { return this.connection.db; }

  async listSources() {
    return this.db.select().from(sources).where(isNull(sources.deletedAt)).orderBy(desc(sources.priority), sources.createdAt).all();
  }
  async getSource(id: string) {
    return this.db.select().from(sources).where(and(eq(sources.id, id), isNull(sources.deletedAt))).get();
  }
  async addSource(input: SourceInput) {
    const now = new Date().toISOString();
    const source = { ...sourceInputSchema.parse(input), id: randomUUID(), lastCheckedAt: null, lastError: null, createdAt: now, updatedAt: now };
    await this.db.insert(sources).values(source).run();
    return source;
  }
  async updateSource(id: string, input: Partial<SourceInput>) {
    const existing = await this.getSource(id);
    if (!existing) throw new Error("来源不存在");
    if ((input.type && input.type !== existing.type) || (input.urlOrIdentifier && input.urlOrIdentifier !== existing.urlOrIdentifier)) {
      const observed = await this.db.select({ id: observations.id }).from(observations)
        .where(eq(observations.sourceId, id)).limit(1).get();
      if (observed) throw new Error("已有采集记录的来源不能更换类型或地址；请新增来源以保留原有证据归属");
    }
    const updated = { ...sourceInputSchema.parse({ ...existing, ...input }), updatedAt: new Date().toISOString() };
    await this.db.update(sources).set(updated).where(eq(sources.id, id)).run();
    return { ...existing, ...updated };
  }
  async deleteSource(id: string) {
    if (!await this.getSource(id)) throw new Error("来源不存在");
    await this.db.update(sources).set({ enabled: false, deletedAt: new Date().toISOString() }).where(eq(sources.id, id)).run();
  }
  async markSourceChecked(id: string, error: string | null) {
    await this.db.update(sources).set({ lastCheckedAt: new Date().toISOString(), lastError: error }).where(eq(sources.id, id)).run();
  }

  async listTopics() {
    return this.db.select().from(topics).orderBy(desc(topics.weight), topics.name).all();
  }
  async addTopic(input: TopicInput) {
    const topic = { ...topicInputSchema.parse(input), id: randomUUID() };
    await this.db.insert(topics).values(topic).run();
    return topic;
  }
  async updateTopic(id: string, input: Partial<TopicInput>) {
    const existing = await this.db.select().from(topics).where(eq(topics.id, id)).get();
    if (!existing) throw new Error("主题不存在");
    const topic = { ...topicInputSchema.parse({ ...existing, ...input }), id };
    await this.db.update(topics).set(topic).where(eq(topics.id, id)).run();
    return topic;
  }
  async deleteTopic(id: string) {
    const result = await this.db.delete(topics).where(eq(topics.id, id)).run();
    if (!result.rowsAffected) throw new Error("主题不存在");
  }

  async findDuplicate(draft: ContentDraft, canonicalUrl: string, fingerprint: string) {
    const observation = await this.db.select().from(observations)
      .where(and(eq(observations.sourceId, draft.sourceId), eq(observations.externalId, draft.externalId))).get();
    if (observation) return this.getContent(observation.contentItemId);
    return this.db.select().from(contents).where(or(
      and(eq(contents.sourceId, draft.sourceId), eq(contents.externalId, draft.externalId)),
      eq(contents.canonicalUrl, canonicalUrl), eq(contents.fingerprint, fingerprint),
    )).get();
  }
  async insertContent(content: ContentItem) { await this.db.insert(contents).values(content).run(); }
  async getContent(id: string) { return this.db.select().from(contents).where(eq(contents.id, id)).get(); }
  async transitionContent(id: string, state: ProcessingState, error?: string) {
    const content = await this.getContent(id);
    if (!content) throw new Error("内容不存在");
    assertTransition(content.state, state);
    const updated = { ...content, state, error: error ?? null, attempts: content.attempts + (state === "processing" ? 1 : 0) };
    await this.db.update(contents).set(updated).where(eq(contents.id, id)).run();
    return updated;
  }
  async retryableContents(sourceId: string, includeDevelopment = false) {
    const rows = await this.db.select({ content: contents, provider: intelligence.provider }).from(contents)
      .leftJoin(intelligence, eq(contents.id, intelligence.contentItemId)).where(eq(contents.sourceId, sourceId)).all();
    return rows.filter(row => ["failed", "pending"].includes(row.content.state) || (includeDevelopment && row.provider === "development"))
      .map(row => row.content);
  }
  async observe(contentId: string, draft: ContentDraft) {
    await this.db.insert(observations).values({ id: randomUUID(), contentItemId: contentId, sourceId: draft.sourceId,
      externalId: draft.externalId, url: draft.url, rawContent: draft.rawContent, observedAt: draft.fetchedAt }).onConflictDoNothing().run();
  }
  async observations(contentId: string) {
    return this.db.select().from(observations).where(eq(observations.contentItemId, contentId)).all();
  }
  async saveIntelligence(item: IntelligenceItem) {
    await this.db.transaction(async tx => {
      const content = await tx.select().from(contents).where(eq(contents.id, item.contentItemId)).get();
      if (!content) throw new Error("内容不存在");
      assertTransition(content.state, "completed");
      const { favorite: _favorite, read: _read, ...analysis } = item;
      await tx.insert(intelligence).values(item).onConflictDoUpdate({ target: intelligence.contentItemId, set: analysis }).run();
      await tx.update(contents).set({ state: "completed", error: null }).where(eq(contents.id, item.contentItemId)).run();
    });
  }

  async feed(filters: FeedFilters) { return readLibsqlFeed(this.db, filters); }
  async getItem(id: string) { return readLibsqlItem(this.db, id); }
  async updateItem(id: string, flags: { favorite?: boolean; read?: boolean }) {
    if (!await this.getItem(id)) throw new Error("情报不存在");
    await this.db.update(intelligence).set(flags).where(eq(intelligence.contentItemId, id)).run();
  }
  async saveRun(run: SyncRun) {
    await this.db.insert(syncRuns).values(run).onConflictDoUpdate({ target: syncRuns.id, set: run }).run();
  }
  async listRuns(limit = 50) {
    return this.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt), sql`sync_runs.rowid DESC`).limit(limit).all();
  }
  async dailyMetrics(since: string) { return readLibsqlDailyMetrics(this.db, since); }

  async acquireLock(owner: string) {
    return withWriteTransaction(this.connection, async transaction => {
      const now = Date.now();
      await transaction.execute({ sql: "DELETE FROM sync_locks WHERE expires_at < ?", args: [now] });
      const inserted = await transaction.execute({
        sql: "INSERT OR IGNORE INTO sync_locks (name, owner, expires_at) VALUES ('ingestion', ?, ?)",
        args: [owner, now + LOCK_LEASE_MS],
      });
      if (!inserted.rowsAffected) return false;

      await transaction.execute({
        sql: "UPDATE contents SET state = 'failed', error = '上次处理意外中断，可重试' WHERE state = 'processing'",
      });
      const interrupted = await transaction.execute("SELECT * FROM sync_runs WHERE state = 'processing'");
      for (const row of interrupted.rows) {
        const run = readSyncRun(row);
        const finishedAt = new Date(now).toISOString();
        const errors = [...run.errors, { stage: "persist" as const, error: "同步意外中断，已恢复", retryable: true,
          attempts: 1, timestamp: finishedAt }];
        await transaction.execute({
          sql: "UPDATE sync_runs SET state = 'failed', finished_at = ?, failed = ?, errors = ? WHERE id = ?",
          args: [finishedAt, run.failed + 1, JSON.stringify(errors), run.id],
        });
      }
      return true;
    });
  }
  async renewLock(owner: string) {
    const result = await this.connection.client.execute({
      sql: "UPDATE sync_locks SET expires_at = ? WHERE name = 'ingestion' AND owner = ?",
      args: [Date.now() + LOCK_LEASE_MS, owner],
    });
    if (!result.rowsAffected) throw new Error("同步锁已失效，请重新同步");
  }
  async releaseLock(owner: string) {
    await this.connection.client.execute({ sql: "DELETE FROM sync_locks WHERE name = 'ingestion' AND owner = ?", args: [owner] });
  }
}
