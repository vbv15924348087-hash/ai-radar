import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const DEFAULT_TOPICS = [
  ["agent", "Agent", "自主代理与工具使用", ["agent", "agents", "agentic", "代理", "智能体"]],
  ["memory", "Memory", "长期记忆、检索与个性化", ["memory", "retrieval", "记忆"]],
  ["context", "Context Engineering", "上下文管理、压缩与可靠性", ["context", "上下文"]],
  ["personal", "Personal AI", "个人 AI 助手与工作流", ["personal ai", "assistant", "助手"]],
  ["multimodal", "Multimodal", "视觉、语音与多模态模型", ["multimodal", "vision", "audio", "多模态"]],
  ["coding", "Vibe Coding", "AI 编程、代码代理与开发工具", ["coding", "codex", "developer", "编程"]],
] as const;

export function openDatabase(filename = process.env.DATABASE_PATH || "./data/radar.sqlite") {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.transaction(() => {
    if (sqlite.pragma("user_version", { simple: true }) === 0) {
      sqlite.exec(readFileSync(resolve("src/infrastructure/db/migrations/0001.sql"), "utf8"));
      const insert = sqlite.prepare("INSERT INTO topics (id,name,description,keywords,weight) VALUES (?,?,?,?,1)");
      for (const [id, name, description, keywords] of DEFAULT_TOPICS) insert.run(id, name, description, JSON.stringify(keywords));
      sqlite.pragma("user_version = 1");
    }
  }).immediate();
  return { sqlite, db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}
export type RadarDatabase = ReturnType<typeof openDatabase>;
