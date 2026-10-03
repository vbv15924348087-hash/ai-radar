import type { AIProvider } from "@/application/ports";
import { DevelopmentAIProvider } from "./development";
import { OpenAIProvider } from "./openai";

export { validateAnalysis } from "./validation";
export { DevelopmentAIProvider } from "./development";
export { OpenAIProvider } from "./openai";

export function createAIProvider(env: Readonly<Record<string, string | undefined>> = process.env): AIProvider {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const provider = env.AI_PROVIDER?.trim() || (apiKey ? "openai" : "development");
  if (provider === "development") return new DevelopmentAIProvider();
  if (provider !== "openai") throw new Error(`未知 AI_PROVIDER：${provider}；可选 development 或 openai`);
  if (!apiKey) throw new Error("AI_PROVIDER=openai 需要配置 OPENAI_API_KEY；本地规则模式请显式设置 AI_PROVIDER=development");
  return new OpenAIProvider({ apiKey, model: env.OPENAI_MODEL, baseUrl: env.OPENAI_BASE_URL });
}
