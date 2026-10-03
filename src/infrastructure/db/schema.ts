import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Analysis } from "@/domain/intelligence";
import type { ProcessingFailure } from "@/domain/sync";
import { SOURCE_TYPES } from "@/domain/source";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  type: text("type", { enum: SOURCE_TYPES }).notNull(),
  urlOrIdentifier: text("url_or_identifier").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  priority: integer("priority").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().notNull(),
  lastCheckedAt: text("last_checked_at"), lastError: text("last_error"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  description: text("description").notNull(),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull(),
  weight: real("weight").notNull(),
});
export const contents = sqliteTable("contents", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id),
  sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
  externalId: text("external_id").notNull(), title: text("title").notNull(),
  author: text("author").notNull(), url: text("url").notNull(), publishedAt: text("published_at"),
  rawContent: text("raw_content").notNull(), normalizedContent: text("normalized_content").notNull(),
  language: text("language").notNull(), fetchedAt: text("fetched_at").notNull(),
  canonicalUrl: text("canonical_url").notNull(), fingerprint: text("fingerprint").notNull(),
  state: text("state", { enum: ["pending", "processing", "completed", "failed"] }).notNull(),
  attempts: integer("attempts").notNull(), error: text("error"), eventId: text("event_id"),
}, table => [uniqueIndex("content_external").on(table.sourceId, table.externalId),
  uniqueIndex("content_canonical").on(table.canonicalUrl), uniqueIndex("content_fingerprint").on(table.fingerprint)]);
export const intelligence = sqliteTable("intelligence", {
  contentItemId: text("content_item_id").primaryKey().references(() => contents.id),
  summary: text("summary").notNull(), whyItMatters: text("why_it_matters").notNull(),
  keyChanges: text("key_changes", { mode: "json" }).$type<string[]>().notNull(),
  productImpact: text("product_impact").notNull(),
  evidence: text("evidence", { mode: "json" }).$type<Analysis["evidence"]>().notNull(),
  topics: text("topics", { mode: "json" }).$type<string[]>().notNull(),
  relevanceScore: real("relevance_score").notNull(), importanceScore: real("importance_score").notNull(),
  noveltyScore: real("novelty_score").notNull(), sourceQualityScore: real("source_quality_score").notNull(),
  finalScore: real("final_score").notNull(), processingVersion: text("processing_version").notNull(),
  provider: text("provider").notNull(), createdAt: text("created_at").notNull(),
  favorite: integer("favorite", { mode: "boolean" }).notNull(), read: integer("read", { mode: "boolean" }).notNull(),
}, table => [index("intelligence_score").on(table.finalScore)]);
export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(), contentItemId: text("content_item_id").notNull().references(() => contents.id),
  sourceId: text("source_id").notNull().references(() => sources.id), externalId: text("external_id").notNull(),
  url: text("url").notNull(), rawContent: text("raw_content").notNull(), observedAt: text("observed_at").notNull(),
}, table => [uniqueIndex("observation_identity").on(table.sourceId, table.externalId)]);
export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id),
  state: text("state", { enum: ["processing", "completed", "failed"] }).notNull(),
  startedAt: text("started_at").notNull(), finishedAt: text("finished_at"),
  durationMs: integer("duration_ms").notNull(), discovered: integer("discovered").notNull(),
  fetched: integer("fetched").notNull(), duplicates: integer("duplicates").notNull(),
  analyzed: integer("analyzed").notNull(), failed: integer("failed").notNull(),
  aiDurationMs: integer("ai_duration_ms").notNull(),
  errors: text("errors", { mode: "json" }).$type<ProcessingFailure[]>().notNull(),
});
