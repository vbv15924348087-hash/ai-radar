import { z } from "zod";
import type { ContentItem } from "./content";
export const analysisSchema = z.object({
  summary: z.string().min(1).max(3000),
  whyItMatters: z.string().min(1).max(3000),
  keyChanges: z.array(z.string().min(1).max(1000)).min(1).max(8),
  productImpact: z.string().min(1).max(3000),
  evidence: z.array(z.object({ quote: z.string().min(1).max(1500), url: z.string().url() }).strict()).min(1).max(8),
  topics: z.array(z.string().min(1)).max(20),
  relevanceScore: z.number().min(0).max(100),
  importanceScore: z.number().min(0).max(100),
  noveltyScore: z.number().min(0).max(100),
  sourceQualityScore: z.number().min(0).max(100),
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;
export interface IntelligenceItem extends Analysis {
  contentItemId: string;
  finalScore: number;
  processingVersion: string;
  provider: string;
  createdAt: string;
  favorite: boolean;
  read: boolean;
}
export interface FeedItem extends IntelligenceItem {
  content: ContentItem;
  sourceName: string;
  observationCount: number;
}
export interface FeedFilters {
  search?: string;
  topic?: string;
  sourceType?: string;
  from?: string;
  to?: string;
  favorite?: boolean;
  unread?: boolean;
  limit?: number;
  offset?: number;
  processedFrom?: string;
}
