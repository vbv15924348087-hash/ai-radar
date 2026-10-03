import { z } from "zod";
import type { AIProvider } from "@/application/ports";
import type { ContentItem } from "@/domain/content";
import { analysisSchema, type Analysis } from "@/domain/intelligence";
import type { TopicMatch } from "@/domain/ranking";
import type { Topic } from "@/domain/topic";
import { ANALYSIS_PROMPT_VERSION, ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { validateAnalysis } from "./validation";

const MAX_CONTENT_CHARS = 24_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 45_000;

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// Verified against official OpenAI documentation on 2026-09-05:
// https://developers.openai.com/api/docs/guides/structured-outputs
// https://developers.openai.com/api/docs/models/gpt-4.1-mini
const responseEnvelopeSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() })).optional(),
  })),
});

/** Remove the URI format unsupported by the API subset; local Zod validates URLs. */
function outputSchema() {
  const schema = z.toJSONSchema(analysisSchema, { target: "draft-7" });
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema" && key !== "format").map(([key, child]) => [key, clean(child)]));
    }
    return value;
  }
  return clean(schema);
}

async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenAI 返回了空响应");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("OpenAI 响应超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly version: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenAIProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("AI_PROVIDER=openai 需要配置 OPENAI_API_KEY");
    this.model = options.model?.trim() || "gpt-4.1-mini";
    const base = new URL((options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/");
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error("OPENAI_BASE_URL 必须为不含凭据、查询或片段的 HTTP(S) API 地址");
    }
    this.endpoint = new URL("responses", base).href;
    this.request = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1) throw new Error("AI 超时时间必须大于 0");
    this.version = `openai-responses:${this.model}:${ANALYSIS_PROMPT_VERSION}`;
  }

  async analyze(content: ContentItem, topics: Topic[], matches: TopicMatch[]): Promise<Analysis> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(this.endpoint, {
        method: "POST", signal: controller.signal, redirect: "error",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(this.buildRequest(content, topics, matches)),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`OpenAI 请求失败（HTTP ${response.status}），请检查凭据、额度与模型配置`);
      }
      const envelope = responseEnvelopeSchema.parse(await readResponse(response));
      if (envelope.status !== "completed") throw new Error(`OpenAI 分析未完成（${envelope.status}）`);
      const blocks = envelope.output.filter(item => item.type === "message").flatMap(item => item.content ?? []);
      if (blocks.some(block => block.type === "refusal")) throw new Error("OpenAI 拒绝生成本条分析");
      const text = blocks.filter(block => block.type === "output_text").map(block => block.text ?? "").join("");
      if (!text) throw new Error("OpenAI 未返回结构化分析文本");
      return validateAnalysis(JSON.parse(text), content, topics);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`OpenAI 分析超时（${this.timeoutMs} ms），可稍后重试`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(content: ContentItem, topics: Topic[], matches: TopicMatch[]) {
    return {
      model: this.model, store: false, max_output_tokens: 4_000,
      input: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({
          article: {
            title: content.title.slice(0, 1_000), author: content.author.slice(0, 500), sourceType: content.sourceType,
            url: content.url, canonicalUrl: content.canonicalUrl, publishedAt: content.publishedAt,
            normalizedContent: content.normalizedContent.slice(0, MAX_CONTENT_CHARS),
            contentTruncated: content.normalizedContent.length > MAX_CONTENT_CHARS,
          },
          providedTopics: topics.slice(0, 100).map(({ id, name, description, keywords, weight }) => ({ id, name, description, keywords, weight })),
          keywordMatches: matches.slice(0, 100).map(match => ({ topicId: match.topic.id, keywords: match.keywords, score: match.score })),
        }) },
      ],
      text: { format: { type: "json_schema", name: "ai_radar_analysis", strict: true, schema: outputSchema() } },
    };
  }
}
