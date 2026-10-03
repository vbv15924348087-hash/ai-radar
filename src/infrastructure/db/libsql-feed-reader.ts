import { and, count, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { FeedFilters, FeedItem } from "@/domain/intelligence";
import type { LibsqlRadarConnection } from "./libsql-connection";
import { contents, intelligence, observations, sources, syncRuns } from "./schema";
import { MUST_READ_THRESHOLD, RELEVANT_THRESHOLD, WORTH_READ_THRESHOLD } from "@/domain/ranking";

type Database = LibsqlRadarConnection["db"];

export async function readLibsqlFeed(db: Database, filters: FeedFilters): Promise<{ items: FeedItem[]; total: number }> {
  const conditions = [];
  if (filters.search) {
    const value = `%${filters.search.replace(/[!%_]/g, "!$&")}%`;
    conditions.push(or(sql`${contents.title} LIKE ${value} ESCAPE '!'`, sql`${intelligence.summary} LIKE ${value} ESCAPE '!'`));
  }
  if (filters.topic) conditions.push(sql`EXISTS (SELECT 1 FROM json_each(${intelligence.topics}) WHERE value = ${filters.topic})`);
  if (filters.sourceType) conditions.push(eq(contents.sourceType, filters.sourceType as typeof contents.$inferSelect.sourceType));
  if (filters.from) conditions.push(gte(sql`coalesce(${contents.publishedAt}, ${contents.fetchedAt})`, filters.from));
  if (filters.to) conditions.push(lte(sql`coalesce(${contents.publishedAt}, ${contents.fetchedAt})`, filters.to));
  if (filters.processedFrom) conditions.push(gte(intelligence.createdAt, filters.processedFrom));
  if (filters.favorite) conditions.push(eq(intelligence.favorite, true));
  if (filters.unread) conditions.push(eq(intelligence.read, false));
  const where = and(...conditions);

  const total = (await db.select({ total: count() }).from(intelligence)
    .innerJoin(contents, eq(contents.id, intelligence.contentItemId)).where(where).get())?.total ?? 0;
  const rows = await db.select({
    intelligence,
    content: contents,
    sourceName: sources.name,
    observationCount: sql<number>`(SELECT count(*) FROM observations WHERE content_item_id = ${contents.id})`,
  }).from(intelligence)
    .innerJoin(contents, eq(contents.id, intelligence.contentItemId))
    .innerJoin(sources, eq(sources.id, contents.sourceId)).where(where)
    .orderBy(desc(intelligence.finalScore), desc(sql`coalesce(${contents.publishedAt}, ${contents.fetchedAt})`), desc(intelligence.createdAt), desc(contents.id))
    .limit(Math.min(100, Math.max(1, filters.limit ?? 50))).offset(Math.max(0, filters.offset ?? 0)).all();
  const items: FeedItem[] = rows.map(row => ({ ...row.intelligence, content: row.content,
    sourceName: row.sourceName, observationCount: row.observationCount }));
  return { items, total };
}

export async function readLibsqlItem(db: Database, id: string): Promise<FeedItem | undefined> {
  const row = await db.select({ intelligence, content: contents, sourceName: sources.name })
    .from(intelligence).innerJoin(contents, eq(contents.id, intelligence.contentItemId))
    .innerJoin(sources, eq(sources.id, contents.sourceId)).where(eq(contents.id, id)).get();
  if (!row) return undefined;
  const observationCount = (await db.select({ value: count() }).from(observations)
    .where(eq(observations.contentItemId, id)).get())?.value ?? 0;
  return { ...row.intelligence, content: row.content, sourceName: row.sourceName, observationCount };
}

export async function readLibsqlDailyMetrics(db: Database, since: string) {
  const scanned = (await db.select({ n: sql<number>`coalesce(sum(${syncRuns.discovered}), 0)` })
    .from(syncRuns).where(gte(syncRuns.startedAt, since)).get())?.n ?? 0;
  const unique = (await db.select({ n: count() }).from(contents).where(gte(contents.fetchedAt, since)).get())?.n ?? 0;
  const scoreCount = async (threshold: number, relevantOnly = false) => (await db.select({ n: count() }).from(intelligence)
    .where(and(gte(intelligence.createdAt, since), gte(relevantOnly ? intelligence.relevanceScore : intelligence.finalScore, threshold))).get())?.n ?? 0;
  const [relevant, worthRead, mustRead] = await Promise.all([
    scoreCount(RELEVANT_THRESHOLD, true),
    scoreCount(WORTH_READ_THRESHOLD),
    scoreCount(MUST_READ_THRESHOLD),
  ]);
  return { scanned, unique, relevant, worthRead, mustRead };
}
