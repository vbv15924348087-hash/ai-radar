import "./cloud-env";
import Database from "better-sqlite3";
import type { InStatement, InValue } from "@libsql/client";
import { lstat, readdir, readFile } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DailyDigest } from "../src/domain/digest";
import { dailyDigestSchema, digestDateSchema } from "../src/infrastructure/digests/store";
import { openLibsqlDatabase } from "../src/infrastructure/db/libsql-connection";

type TableDefinition = {
  name: string;
  columns: readonly string[];
  parent?: { table: string; parentColumn: string; rowColumn: string };
};

const TABLES = [
  { name: "sources", columns: ["id", "name", "type", "url_or_identifier", "enabled", "priority", "metadata", "last_checked_at", "last_error", "created_at", "updated_at", "deleted_at"] },
  { name: "topics", columns: ["id", "name", "description", "keywords", "weight"] },
  { name: "contents", columns: ["id", "source_id", "source_type", "external_id", "title", "author", "url", "published_at", "raw_content", "normalized_content", "language", "fetched_at", "canonical_url", "fingerprint", "state", "attempts", "error", "event_id"], parent: { table: "sources", parentColumn: "id", rowColumn: "source_id" } },
  { name: "intelligence", columns: ["content_item_id", "summary", "why_it_matters", "key_changes", "product_impact", "evidence", "topics", "relevance_score", "importance_score", "novelty_score", "source_quality_score", "final_score", "processing_version", "provider", "created_at", "favorite", "read"], parent: { table: "contents", parentColumn: "id", rowColumn: "content_item_id" } },
  { name: "observations", columns: ["id", "content_item_id", "source_id", "external_id", "url", "raw_content", "observed_at"], parent: { table: "contents", parentColumn: "id", rowColumn: "content_item_id" } },
  { name: "sync_runs", columns: ["id", "source_id", "state", "started_at", "finished_at", "duration_ms", "discovered", "fetched", "duplicates", "analyzed", "failed", "ai_duration_ms", "errors"], parent: { table: "sources", parentColumn: "id", rowColumn: "source_id" } },
] as const satisfies readonly TableDefinition[];

type TableName = (typeof TABLES)[number]["name"];
type Row = Record<string, unknown>;
type Snapshot = {
  counts: Record<TableName, number>;
  rows: Partial<Record<TableName, Row[]>>;
};

const BATCH_SIZE = 25;
const DIGEST_DIRECTORY = resolve("woshipm-daily", "digests");

function localDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim() || "./data/radar.sqlite";
  if (configured === ":memory:") throw new Error("cloud-migrate 需要可读取的本机 SQLite 文件，DATABASE_PATH 不能是 :memory:");
  const filename = resolve(configured);
  if (lstatSync(filename).isSymbolicLink()) throw new Error("本机 SQLite 文件不能是符号链接");
  return filename;
}

function readSqliteSnapshot(includeRows: boolean): Snapshot {
  const filename = localDatabasePath();
  const sqlite = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    return sqlite.transaction(() => {
      const counts = {} as Record<TableName, number>;
      const rows: Partial<Record<TableName, Row[]>> = {};
      for (const table of TABLES) {
        const total = sqlite.prepare(`SELECT count(*) AS total FROM ${table.name}`).get() as { total?: number | bigint } | undefined;
        counts[table.name] = Number(total?.total ?? 0);
        if (includeRows) {
          rows[table.name] = sqlite.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all() as Row[];
        }
      }
      return { counts, rows };
    }).deferred();
  } finally {
    sqlite.close();
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readLocalDigests(): Promise<DailyDigest[]> {
  try {
    if ((await lstat(DIGEST_DIRECTORY)).isSymbolicLink()) throw new Error("简报目录不能是符号链接");
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const filenames = (await readdir(DIGEST_DIRECTORY)).filter(name => {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) return false;
    return digestDateSchema.safeParse(name.slice(0, -5)).success;
  }).sort();
  const digests: DailyDigest[] = [];
  for (const filename of filenames) {
    const date = filename.slice(0, -5);
    const path = join(DIGEST_DIRECTORY, filename);
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`简报文件不能是符号链接：${filename}`);
    let value: unknown;
    try { value = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")); }
    catch { throw new Error(`简报文件无法解析：${filename}`); }
    const digest = dailyDigestSchema.parse(value);
    if (digest.date !== date) throw new Error(`简报日期与文件名不一致：${filename}`);
    digests.push(digest);
  }
  return digests;
}

function toInValue(value: unknown, column: string): InValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return value;
  throw new Error(`SQLite 字段 ${column} 包含无法迁移的数据类型`);
}

function insertStatement(table: TableDefinition, row: Row): InStatement {
  const values = table.columns.map(column => {
    if (!(column in row)) throw new Error(`本机 ${table.name} 表缺少字段 ${column}`);
    return toInValue(row[column], `${table.name}.${column}`);
  });
  const columns = table.columns.join(", ");
  const placeholders = table.columns.map(() => "?").join(", ");
  if (!table.parent) {
    return { sql: `INSERT INTO ${table.name} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, args: values };
  }
  values.push(toInValue(row[table.parent.rowColumn], `${table.name}.${table.parent.rowColumn}`));
  return {
    sql: `INSERT INTO ${table.name} (${columns}) SELECT ${placeholders} WHERE EXISTS (SELECT 1 FROM ${table.parent.table} WHERE ${table.parent.parentColumn} = ?) ON CONFLICT DO NOTHING`,
    args: values,
  };
}

async function insertTable(client: Awaited<ReturnType<typeof openLibsqlDatabase>>["client"], table: TableDefinition, rows: Row[]) {
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const statements = rows.slice(offset, offset + BATCH_SIZE).map(row => insertStatement(table, row));
    const results = await client.batch(statements, "write");
    inserted += results.reduce((total, result) => total + Number(result.rowsAffected), 0);
  }
  return inserted;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== "--execute") || args.filter(argument => argument === "--execute").length > 1) {
    throw new Error("用法：npm run cloud:migrate [-- --execute]");
  }
  const execute = args.includes("--execute");
  const local = readSqliteSnapshot(execute);
  const digests = await readLocalDigests();
  const plan = {
    mode: execute ? "execute" : "dry-run",
    tables: local.counts,
    digests: { files: digests.length, items: digests.reduce((total, digest) => total + digest.items.length, 0) },
    excluded: ["sync_locks", "selections", "private articles"],
  };
  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    console.log("只读预览完成；确认数量后使用 --execute 才会写入 Turso。未连接云端数据库。");
    return;
  }

  if (!process.env.TURSO_DATABASE_URL?.trim()) throw new Error("执行迁移前请配置 TURSO_DATABASE_URL");
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) throw new Error("执行迁移前请配置 TURSO_AUTH_TOKEN");
  const connection = await openLibsqlDatabase();
  try {
    const imported: Partial<Record<TableName, { local: number; inserted: number }>> = {};
    for (const table of TABLES) {
      const rows = local.rows[table.name] ?? [];
      imported[table.name] = { local: rows.length, inserted: await insertTable(connection.client, table, rows) };
    }
    let digestsInserted = 0;
    for (const digest of digests) {
      const result = await connection.client.execute({
        sql: "INSERT INTO radar_documents (kind, date, data) VALUES ('digest', ?, ?) ON CONFLICT(kind, date) DO NOTHING",
        args: [digest.date, JSON.stringify(digest)],
      });
      digestsInserted += Number(result.rowsAffected);
    }
    console.log(JSON.stringify({ ...plan, imported, digestsInserted }, null, 2));
    console.log("迁移完成。云端已有的同 ID、唯一键及同日期简报均已保留。");
  } finally {
    await connection.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "云端迁移失败");
  process.exitCode = 1;
});
