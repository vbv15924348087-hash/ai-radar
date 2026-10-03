import type { Analysis } from "./intelligence";
import type { Topic } from "./topic";

export const RANKING_VERSION = "ranking-1";
export const RELEVANT_THRESHOLD = 35;
export const WORTH_READ_THRESHOLD = 60;
export const MUST_READ_THRESHOLD = 80;
const WEIGHTS = { relevanceScore: 0.4, importanceScore: 0.3, noveltyScore: 0.2, sourceQualityScore: 0.1 } as const;
export function calculateFinalScore(scores: Pick<Analysis, keyof typeof WEIGHTS>): number {
  return Math.round(Object.entries(WEIGHTS).reduce((total, [key, weight]) => {
    const value = scores[key as keyof typeof WEIGHTS];
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("评分必须在 0–100 之间");
    return total + value * weight;
  }, 0));
}
export interface TopicMatch { topic: Topic; keywords: string[]; score: number }
export function matchTopics(text: string, topics: Topic[]): TopicMatch[] {
  const lower = text.toLocaleLowerCase();
  return topics.flatMap(topic => {
    const keywords = topic.keywords.filter(keyword => {
      const escaped = keyword.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "iu").test(lower);
    });
    return keywords.length ? [{ topic, keywords, score: Math.min(100, Math.round((40 + 15 * keywords.length) * topic.weight)) }] : [];
  }).sort((a, b) => b.score - a.score);
}
