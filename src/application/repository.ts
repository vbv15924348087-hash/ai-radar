import type { ContentDraft, ContentItem, Observation, ProcessingState } from "@/domain/content";
import type { FeedFilters, FeedItem, IntelligenceItem } from "@/domain/intelligence";
import type { Source, SourceInput } from "@/domain/source";
import type { Topic, TopicInput } from "@/domain/topic";
import type { SyncRun } from "@/domain/sync";

export interface RadarRepository {
  listSources(): Source[];
  getSource(id: string): Source | undefined;
  addSource(input: SourceInput): Source;
  updateSource(id: string, input: Partial<SourceInput>): Source;
  deleteSource(id: string): void;
  markSourceChecked(id: string, error: string | null): void;
  listTopics(): Topic[];
  addTopic(input: TopicInput): Topic;
  updateTopic(id: string, input: Partial<TopicInput>): Topic;
  deleteTopic(id: string): void;
  findDuplicate(draft: ContentDraft, canonicalUrl: string, fingerprint: string): ContentItem | undefined;
  insertContent(content: ContentItem): void;
  getContent(id: string): ContentItem | undefined;
  transitionContent(id: string, state: ProcessingState, error?: string): ContentItem;
  retryableContents(sourceId: string, includeDevelopment?: boolean): ContentItem[];
  observe(contentId: string, draft: ContentDraft): void;
  observations(contentId: string): Observation[];
  saveIntelligence(item: IntelligenceItem): void;
  feed(filters: FeedFilters): { items: FeedItem[]; total: number };
  getItem(id: string): FeedItem | undefined;
  updateItem(id: string, flags: { favorite?: boolean; read?: boolean }): void;
  saveRun(run: SyncRun): void;
  listRuns(limit?: number): SyncRun[];
  dailyMetrics(since: string): { scanned: number; unique: number; relevant: number; worthRead: number; mustRead: number };
  acquireLock(owner: string): boolean;
  renewLock(owner: string): void;
  releaseLock(owner: string): void;
}
