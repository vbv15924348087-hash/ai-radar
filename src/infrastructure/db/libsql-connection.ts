import { createClient, type Client, type Transaction } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as schema from "./schema";

const DEFAULT_TOPICS = [
  ["agent", "Agent", "自主代理与工具使用", ["agent", "agents", "agentic", "代理", "智能体"]],
  ["memory", "Memory", "长期记忆、检索与个性化", ["memory", "retrieval", "记忆"]],
  ["context", "Context Engineering", "上下文管理、压缩与可靠性", ["context", "上下文"]],
  ["personal", "Personal AI", "个人 AI 助手与工作流", ["personal ai", "assistant", "助手"]],
  ["multimodal", "Multimodal", "视觉、语音与多模态模型", ["multimodal", "vision", "audio", "多模态"]],
  ["coding", "Vibe Coding", "AI 编程、代码代理与开发工具", ["coding", "codex", "developer", "编程"]],
] as const;

const CURRENT_SCHEMA_VERSION = 1;
const DOCUMENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS radar_documents (
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (kind, date)
);`;
const METADATA_SCHEMA = `
CREATE TABLE IF NOT EXISTS radar_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`;

let migrationText: Promise<string> | undefined;
const initializationByDatabase = new Map<string, Promise<void>>();
function readMigration(): Promise<string> {
  migrationText ??= readFile(resolve(process.cwd(), "src/infrastructure/db/migrations/0001.sql"), "utf8");
  return migrationText;
}

function makeMigrationIdempotent(sql: string): string {
  return sql
    .replace(/\bCREATE TABLE (?!IF NOT EXISTS\b)/gi, "CREATE TABLE IF NOT EXISTS ")
    .replace(/\bCREATE (UNIQUE )?INDEX (?!IF NOT EXISTS\b)/gi, (_match, unique: string | undefined) =>
      `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `);
}

function migrationStatements(sql: string): string[] {
  // The checked-in migration contains no semicolons inside literals or trigger
  // bodies; execute statements separately so the SQLite-backed test client
  // can finish each prepared statement before committing the transaction.
  return sql.split(";").map(statement => statement.trim()).filter(Boolean);
}

function isRetryableInitializationError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = String(record.code ?? "");
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_(BUSY|LOCKED)|database is locked|write conflict|transaction conflict/i.test(`${code} ${message}`);
}

const delay = (milliseconds: number) => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

/** Run the current SQL migration exactly once, even when several serverless instances start together. */
async function performInitialization(client: Client): Promise<void> {
  const tableExists = async (executor: Pick<Client, "execute">, name: string) => {
    const result = await executor.execute({
      sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
      args: [name],
    });
    return result.rows.length > 0;
  };
  const readVersion = async (executor: Pick<Client, "execute">) => {
    const pragma = await executor.execute("PRAGMA user_version");
    let version = Number(pragma.rows[0]?.user_version ?? 0);
    if (await tableExists(executor, "radar_metadata")) {
      const stored = await executor.execute({ sql: "SELECT value FROM radar_metadata WHERE key = 'schema_version'" });
      version = Math.max(version, Number(stored.rows[0]?.value ?? 0));
    }
    return version;
  };

  // Normal request-time opens stay read-only once initialized. Only a new or
  // partially upgraded database needs the serialized write path below.
  const initialVersion = await readVersion(client);
  if (initialVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`数据库 schema 版本 ${initialVersion} 高于当前支持的 ${CURRENT_SCHEMA_VERSION}`);
  }
  if (initialVersion === CURRENT_SCHEMA_VERSION && await tableExists(client, "radar_documents")) return;

  const migration = migrationStatements(makeMigrationIdempotent(await readMigration()));

  for (let attempt = 0; attempt < 6; attempt++) {
    let transaction: Transaction | undefined;
    try {
      transaction = await client.transaction("write");
      const result = await transaction.execute("PRAGMA user_version");
      const version = Number(result.rows[0]?.user_version ?? 0);
      if (version > CURRENT_SCHEMA_VERSION) {
        throw new Error(`数据库 schema 版本 ${version} 高于当前支持的 ${CURRENT_SCHEMA_VERSION}`);
      }

      if (version === 0) {
        await transaction.batch(migration.map(sql => ({ sql })));
        for (const [id, name, description, keywords] of DEFAULT_TOPICS) {
          await transaction.execute({
            sql: "INSERT INTO topics (id,name,description,keywords,weight) VALUES (?,?,?,?,1) ON CONFLICT(id) DO NOTHING",
            args: [id, name, description, JSON.stringify(keywords)],
          });
        }
      }

      // This table was added with the remote document store, so create it on every
      // open to support databases that already had user_version=1.
      await transaction.execute(DOCUMENTS_SCHEMA);
      await transaction.execute(METADATA_SCHEMA);
      await transaction.execute({
        sql: "INSERT INTO radar_metadata (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        args: [String(CURRENT_SCHEMA_VERSION)],
      });
      await transaction.commit();
      return;
    } catch (error) {
      try { await transaction?.rollback(); } catch { /* The transaction may already be closed. */ }
      if (attempt === 5 || !isRetryableInitializationError(error)) throw error;
      await delay(20 * 2 ** attempt);
    } finally {
      transaction?.close();
    }
  }
}

/** Local warm instances share the same initialization promise; remote races still use the transactional idempotent path. */
export async function initializeLibsqlDatabase(client: Client, databaseKey?: string): Promise<void> {
  if (!databaseKey) return performInitialization(client);
  const existing = initializationByDatabase.get(databaseKey);
  if (existing) {
    try { await existing; return; }
    catch { /* A failed initializer must not prevent this caller from retrying. */ }
  }

  const pending = performInitialization(client);
  initializationByDatabase.set(databaseKey, pending);
  try { await pending; }
  finally {
    if (initializationByDatabase.get(databaseKey) === pending) initializationByDatabase.delete(databaseKey);
  }
}

export type RadarDocumentsDatabase = LibSQLDatabase<typeof schema>;

export async function openLibsqlDatabase(
  url = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN,
) {
  if (!url?.trim()) throw new Error("TURSO_DATABASE_URL 未配置");
  const client = createClient({ url: url.trim(), ...(authToken?.trim() ? { authToken: authToken.trim() } : {}) });
  try {
    await initializeLibsqlDatabase(client, url.trim());
    const db = drizzle(client, { schema });
    let closed = false;
    return {
      client,
      db,
      async close() {
        if (!closed) {
          closed = true;
          client.close();
        }
      },
    };
  } catch (error) {
    client.close();
    throw error;
  }
}

export type LibsqlRadarConnection = Awaited<ReturnType<typeof openLibsqlDatabase>>;
export type RadarDocumentKind = "digest" | "selection";

export async function readRadarDocument(client: Client, kind: RadarDocumentKind, date: string): Promise<unknown | undefined> {
  const result = await client.execute({
    sql: "SELECT data FROM radar_documents WHERE kind = ? AND date = ?",
    args: [kind, date],
  });
  const encoded = result.rows[0]?.data;
  if (encoded === undefined) return undefined;
  if (typeof encoded !== "string") throw new Error("持久化简报数据格式无效");
  try { return JSON.parse(encoded); }
  catch { throw new Error("持久化简报 JSON 格式无效"); }
}

export async function writeRadarDocument(client: Client, kind: RadarDocumentKind, date: string, data: unknown): Promise<void> {
  const encoded = JSON.stringify(data);
  if (encoded === undefined) throw new Error("不能保存未定义的简报数据");
  await client.execute({
    sql: `INSERT INTO radar_documents (kind, date, data) VALUES (?, ?, ?)
      ON CONFLICT(kind, date) DO UPDATE SET data = excluded.data`,
    args: [kind, date, encoded],
  });
}
