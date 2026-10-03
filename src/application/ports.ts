import type { ContentDraft, ContentItem, RawItem } from "@/domain/content";
import type { Analysis } from "@/domain/intelligence";
import type { Source } from "@/domain/source";
import type { Topic } from "@/domain/topic";
import type { TopicMatch } from "@/domain/ranking";

export interface SourceAdapter {
  discover(source: Source): Promise<RawItem[]>;
  fetch(raw: RawItem, source: Source): Promise<RawItem>;
  normalize(raw: RawItem, source: Source): ContentDraft;
}
export interface AIProvider {
  readonly name: string;
  readonly version: string;
  analyze(content: ContentItem, topics: Topic[], matches: TopicMatch[]): Promise<Analysis>;
}
export interface SemanticDeduplicator {
  findSimilar(content: ContentDraft): Promise<string | null>;
}
