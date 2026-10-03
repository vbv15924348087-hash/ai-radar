import type { AIProvider } from "@/application/ports";
import type { ContentItem } from "@/domain/content";
import type { Analysis } from "@/domain/intelligence";
import type { TopicMatch } from "@/domain/ranking";
import type { SourceType } from "@/domain/source";
import type { Topic } from "@/domain/topic";
import { validateAnalysis } from "./validation";

const QUALITY_BY_TYPE: Record<SourceType, number> = { RSS: 65, GitHub: 80, Blog: 65, Paper: 75, YouTube: 55, X: 45 };

/** Explicit local development mode. No invented model conclusions or remote calls. */
export class DevelopmentAIProvider implements AIProvider {
  readonly name = "development";
  readonly version = "development-rules-1";

  async analyze(content: ContentItem, topics: Topic[], matches: TopicMatch[]): Promise<Analysis> {
    const quote = (content.normalizedContent.trim() || content.title.trim()).slice(0, 700);
    if (!quote) throw new Error("内容为空，无法生成可核验的证据");
    const related = matches.filter(match => topics.some(topic => topic.id === match.topic.id)).slice(0, 20);
    const keywords = [...new Set(related.flatMap(match => match.keywords))].slice(0, 12);
    const result: Analysis = {
      summary: `【开发模式：规则摘录，非模型总结】已获取《${content.title.slice(0, 500)}》。${related.length ? `命中 ${related.length} 个关注主题。` : "未命中关注主题关键词。"}请结合下方原文证据判断内容。`,
      whyItMatters: related.length
        ? `关键词规则关联到 ${related.map(match => match.topic.name).join("、")}；命中词：${keywords.join("、")}。这仅表示词面相关，需要阅读原文确认实际意义。`
        : "当前内容未命中已配置的主题关键词；规则无法判断其实际重要性。",
      keyChanges: ["开发模式仅保留原文摘录，未由模型提炼或验证变化；请阅读 Evidence。"],
      productImpact: "尚未进行模型分析，无法可靠判断产品影响。当前重要性、新颖性与来源质量分为开发用规则估计，新颖性未进行历史对比。",
      evidence: [{ quote, url: content.url }],
      topics: related.map(match => match.topic.id),
      relevanceScore: Math.min(100, Math.max(0, ...related.map(match => match.score))),
      importanceScore: 45,
      noveltyScore: 40,
      sourceQualityScore: QUALITY_BY_TYPE[content.sourceType],
    };
    return validateAnalysis(result, content, topics);
  }
}
