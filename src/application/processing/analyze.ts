import type { AIProvider } from "@/application/ports";
import type { RadarRepository } from "@/application/repository";
import type { ContentItem } from "@/domain/content";
import { validateAnalysis } from "@/domain/analysis-validation";
import { calculateFinalScore, matchTopics, RANKING_VERSION } from "@/domain/ranking";
import type { PipelineStage } from "@/domain/sync";
import type { Topic } from "@/domain/topic";

export class StageError extends Error {
  constructor(readonly stage: PipelineStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : "未知处理错误", { cause });
  }
}
export async function stage<T>(name: PipelineStage, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); } catch (error) { throw new StageError(name, error); }
}

export async function analyzeContent(repository: RadarRepository, provider: AIProvider, content: ContentItem, topics: Topic[]) {
  const processing = await repository.transitionContent(content.id, "processing");
  try {
    const matches = await stage("classify", () => matchTopics(`${content.title}\n${content.normalizedContent}`, topics));
    const start = performance.now();
    const analysis = await stage("summarize", async () => validateAnalysis(await provider.analyze(processing, topics, matches), content, topics));
    const aiDurationMs = Math.round(performance.now() - start);
    const finalScore = await stage("score", () => calculateFinalScore(analysis));
    await stage("persist", () => repository.saveIntelligence({ ...analysis, contentItemId: content.id, finalScore,
      provider: provider.name, processingVersion: `${provider.version}/${RANKING_VERSION}`,
      createdAt: new Date().toISOString(), favorite: false, read: false }));
    return { aiDurationMs };
  } catch (error) {
    await repository.transitionContent(content.id, "failed", error instanceof Error ? error.message : "分析失败");
    throw error;
  }
}
