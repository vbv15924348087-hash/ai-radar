import type { ContentDraft, ContentItem, Observation, ProcessingState } from "@/domain/content";
import type { FeedFilters, FeedItem, IntelligenceItem } from "@/domain/intelligence";
import type { Source, SourceInput } from "@/domain/source";
import type { Topic, TopicInput } from "@/domain/topic";
import type { SyncRun } from "@/domain/sync";

export type Awaitable<T> = T | Promise<T>;

export interface RadarRepository {
  listSources(): Awaitable<Source[]>;
  getSource(id: string): Awaitable<Source | undefined>;
  addSource(input: SourceInput): Awaitable<Source>;
  updateSource(id: string, input: Partial<SourceInput>): Awaitable<Source>;
  deleteSource(id: string): Awaitable<void>;
  markSourceChecked(id: string, error: string | null): Awaitable<void>;
  listTopics(): Awaitable<Topic[]>;
  addTopic(input: TopicInput): Awaitable<Topic>;
  updateTopic(id: string, input: Partial<TopicInput>): Awaitable<Topic>;
  deleteTopic(id: string): Awaitable<void>;
  findDuplicate(draft: ContentDraft, canonicalUrl: string, fingerprint: string): Awaitable<ContentItem | undefined>;
  insertContent(content: ContentItem): Awaitable<void>;
  getContent(id: string): Awaitable<ContentItem | undefined>;
  transitionContent(id: string, state: ProcessingState, error?: string): Awaitable<ContentItem>;
  retryableContents(sourceId: string, includeDevelopment?: boolean): Awaitable<ContentItem[]>;
  observe(contentId: string, draft: ContentDraft): Awaitable<void>;
  observations(contentId: string): Awaitable<Observation[]>;
  saveIntelligence(item: IntelligenceItem): Awaitable<void>;
  feed(filters: FeedFilters): Awaitable<{ items: FeedItem[]; total: number }>;
  getItem(id: string): Awaitable<FeedItem | undefined>;
  updateItem(id: string, flags: { favorite?: boolean; read?: boolean }): Awaitable<void>;
  saveRun(run: SyncRun): Awaitable<void>;
  listRuns(limit?: number): Awaitable<SyncRun[]>;
  dailyMetrics(since: string): Awaitable<{ scanned: number; unique: number; relevant: number; worthRead: number; mustRead: number }>;
  acquireLock(owner: string): Awaitable<boolean>;
  renewLock(owner: string): Awaitable<void>;
  releaseLock(owner: string): Awaitable<void>;
}
