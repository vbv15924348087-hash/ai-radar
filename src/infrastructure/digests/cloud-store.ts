import type { Client } from "@libsql/client";
import type { DailyDigest, DigestIndexItem, DigestSelection } from "@/domain/digest";
import { openLibsqlDatabase } from "@/infrastructure/db/libsql-connection";
import { createLocalDigestStore, dailyDigestSchema, digestDateSchema, digestSelectionInputSchema, selectionSchema } from "./store";

/** Hosted data lives in the shared database; bundled research is only a read fallback. */
export function createCloudDigestStore(bundledDirectory?: string) {
  const bundled = createLocalDigestStore(bundledDirectory);
  async function database<T>(action: (client: Client) => Promise<T>) {
    const connection = await openLibsqlDatabase();
    try { return await action(connection.client); } finally { await connection.close(); }
  }
  async function readDocument(kind: string, date: string) {
    const key = digestDateSchema.parse(date);
    return database(async client => {
      const result = await client.execute({ sql: "SELECT data FROM radar_documents WHERE kind = ? AND date = ?", args: [kind, key] });
      return result.rows.length ? JSON.parse(String(result.rows[0].data)) as unknown : undefined;
    });
  }
  async function writeDocument(kind: string, date: string, data: unknown) {
    return database(async client => { await client.execute({
      sql: "INSERT INTO radar_documents(kind,date,data) VALUES (?,?,?) ON CONFLICT(kind,date) DO UPDATE SET data=excluded.data",
      args: [kind, date, JSON.stringify(data)],
    }); });
  }
  async function readDigest(date: string): Promise<DailyDigest> {
    const value = await readDocument("digest", date);
    if (value === undefined) return bundled.readDigest(date);
    const digest = dailyDigestSchema.parse(value);
    if (digest.date !== date) throw new Error("简报日期与存储键不一致");
    return digest;
  }
  async function readSelection(date: string): Promise<DigestSelection> {
    const value = await readDocument("selection", date);
    if (value === undefined) return { date, selectedIds: [], angle: "", updatedAt: null };
    const selection = selectionSchema.parse(value);
    if (selection.date !== date) throw new Error("选题日期与存储键不一致");
    return selection;
  }
  async function listDigests(): Promise<DigestIndexItem[]> {
    const fallback = await bundled.listDigests();
    const remote = await database(async client => (await client.execute("SELECT data FROM radar_documents WHERE kind='digest'")).rows.map(row => dailyDigestSchema.parse(JSON.parse(String(row.data)))));
    const index = new Map(fallback.map(item => [item.date, item]));
    for (const digest of remote) index.set(digest.date, { date: digest.date, title: digest.title, count: digest.items.length, generatedAt: digest.generatedAt });
    return [...index.values()].sort((a, b) => b.date.localeCompare(a.date));
  }
  async function readDigestWithSelection(date: string) {
    return { digest: await readDigest(date), selection: await readSelection(date) };
  }
  async function writeDigest(value: unknown) {
    const digest = dailyDigestSchema.parse(value);
    await writeDocument("digest", digest.date, digest);
    return digest;
  }
  async function saveSelection(date: string, value: unknown) {
    const digest = await readDigest(date);
    const input = digestSelectionInputSchema.parse(value);
    const ids = new Set(digest.items.map(item => item.id));
    if (input.selectedIds.some(id => !ids.has(id))) throw new Error("选题包含不属于当日简报的资讯 ID");
    const selection: DigestSelection = { date, ...input, updatedAt: new Date().toISOString() };
    await writeDocument("selection", date, selection);
    return selection;
  }
  return { listDigests, readDigest, readSelection, readDigestWithSelection, writeDigest, saveSelection };
}
