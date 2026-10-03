import type { SourceType } from "./source";
export type ProcessingState = "pending" | "processing" | "completed" | "failed";
export interface RawItem { externalId: string; url: string; payload: unknown }
export interface ContentDraft {
  sourceId: string;
  sourceType: SourceType;
  externalId: string;
  title: string;
  author: string;
  url: string;
  publishedAt: string | null;
  rawContent: string;
  normalizedContent: string;
  language: string;
  fetchedAt: string;
}
export interface ContentItem extends ContentDraft {
  id: string;
  canonicalUrl: string;
  fingerprint: string;
  state: ProcessingState;
  attempts: number;
  error: string | null;
  eventId: string | null;
}
export interface Observation {
  id: string;
  contentItemId: string;
  sourceId: string;
  externalId: string;
  url: string;
  rawContent: string;
  observedAt: string;
}
