import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { DailyDigest, DigestIndexItem, DigestSelection } from "@/domain/digest";
import { validatePublicUrl } from "@/infrastructure/http/public-http";
import { createCloudDigestStore } from "./cloud-store";
import { cloudDatabaseConfigured, isCloudDeployment } from "@/infrastructure/deployment";

export const digestDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期须为 YYYY-MM-DD").refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "日期无效");

const instantSchema = z.iso.datetime({ offset: true });
const itemIdSchema = z.string().trim().min(1).max(120);
const publicUrlSchema = z.string().max(4000).refine(value => {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try { validatePublicUrl(value); return true; } catch { return false; }
}, "来源必须使用安全的公开 HTTP 或 HTTPS 链接");
const shortText = z.string().trim().min(1).max(300);
const text = z.string().trim().min(1).max(8000);

export const dailyDigestSchema: z.ZodType<DailyDigest> = z.object({
  date: digestDateSchema,
  generatedAt: instantSchema,
  windowStart: instantSchema,
  title: shortText,
  intro: text,
  coverageNotes: z.array(text).max(30),
  items: z.array(z.object({
    id: itemIdSchema,
    title: shortText,
    source: shortText,
    sourceUrl: publicUrlSchema,
    publishedAt: digestDateSchema,
    freshness: z.enum(["24h", "72h", "7d"]),
    category: shortText,
    summary: text,
    whyItMatters: text,
    angle: text,
    caveat: z.string().trim().max(8000),
    evidence: z.array(z.object({ url: publicUrlSchema, quote: text }).strict()).min(1).max(20),
    recommended: z.boolean(),
  }).strict()).max(100),
}).strict().superRefine((digest, context) => {
  const seen = new Set<string>();
  digest.items.forEach((item, index) => {
    if (seen.has(item.id)) context.addIssue({ code: "custom", path: ["items", index, "id"], message: "资讯 ID 不可重复" });
    seen.add(item.id);
  });
  if (Date.parse(digest.windowStart) > Date.parse(digest.generatedAt)) {
    context.addIssue({ code: "custom", path: ["windowStart"], message: "检索开始时间不可晚于生成时间" });
  }
});

export const digestSelectionInputSchema = z.object({
  selectedIds: z.array(itemIdSchema).max(100).refine(ids => new Set(ids).size === ids.length, "选题 ID 不可重复"),
  angle: z.string().trim().max(4000),
}).strict();
export type DigestSelectionInput = z.infer<typeof digestSelectionInputSchema>;
export const selectionSchema: z.ZodType<DigestSelection> = digestSelectionInputSchema.extend({
  date: digestDateSchema,
  updatedAt: instantSchema.nullable(),
}).strict();

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function datedPath(directory: string, date: string): string {
  const filename = resolve(directory, `${digestDateSchema.parse(date)}.json`);
  if (dirname(filename) !== directory) throw new Error("简报路径超出存储目录");
  return filename;
}

async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("简报存储路径不能是符号链接");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function readJson(filename: string): Promise<unknown | undefined> {
  await rejectSymlink(dirname(filename));
  await rejectSymlink(filename);
  try {
    const content = await readFile(filename, "utf8");
    try { return JSON.parse(content.replace(/^\uFEFF/, "")); }
    catch { throw new Error("简报文件 JSON 格式无效"); }
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function atomicWrite(filename: string, value: unknown): Promise<void> {
  await rejectSymlink(dirname(filename));
  await rejectSymlink(filename);
  await mkdir(dirname(filename), { recursive: true });
  const temporary = join(dirname(filename), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filename);
  } finally {
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) throw error; }
  }
}

/** Digests are replaceable research; selections are a separate record of the user's intent. */
export function createLocalDigestStore(digestsDirectory = join(process.cwd(), "woshipm-daily", "digests")) {
  const digestDirectory = resolve(digestsDirectory);
  const selectionDirectory = join(dirname(digestDirectory), "selections");

  async function readDigest(date: string): Promise<DailyDigest> {
    const value = await readJson(datedPath(digestDirectory, date));
    if (value === undefined) throw new Error("当日简报不存在");
    const digest = dailyDigestSchema.parse(value);
    if (digest.date !== date) throw new Error("简报日期与文件名不一致");
    return digest;
  }

  async function readSelection(date: string): Promise<DigestSelection> {
    const value = await readJson(datedPath(selectionDirectory, date));
    if (value === undefined) return { date, selectedIds: [], angle: "", updatedAt: null };
    const selection = selectionSchema.parse(value);
    if (selection.date !== date) throw new Error("选题日期与文件名不一致");
    return selection;
  }

  async function listDigests(): Promise<DigestIndexItem[]> {
    await rejectSymlink(digestDirectory);
    let filenames: string[];
    try { filenames = await readdir(digestDirectory); }
    catch (error) { if (isMissing(error)) return []; throw error; }
    const dates = filenames.flatMap(filename => {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(filename)) return [];
      const date = filename.slice(0, -5);
      return digestDateSchema.safeParse(date).success ? [date] : [];
    }).sort().reverse();
    return Promise.all(dates.map(async date => {
      const digest = await readDigest(date);
      return { date, title: digest.title, count: digest.items.length, generatedAt: digest.generatedAt };
    }));
  }

  async function readDigestWithSelection(date: string) {
    const digest = await readDigest(date);
    return { digest, selection: await readSelection(date) };
  }

  async function writeDigest(value: unknown): Promise<DailyDigest> {
    const digest = dailyDigestSchema.parse(value);
    await atomicWrite(datedPath(digestDirectory, digest.date), digest);
    return digest;
  }

  async function saveSelection(date: string, value: unknown): Promise<DigestSelection> {
    const digest = await readDigest(date);
    const input = digestSelectionInputSchema.parse(value);
    const ids = new Set(digest.items.map(item => item.id));
    if (input.selectedIds.some(id => !ids.has(id))) throw new Error("选题包含不属于当日简报的资讯 ID");
    const selection: DigestSelection = { date, ...input, updatedAt: new Date().toISOString() };
    await atomicWrite(datedPath(selectionDirectory, date), selection);
    return selection;
  }

  return { listDigests, readDigest, readSelection, readDigestWithSelection, writeDigest, saveSelection };
}

export function createDigestStore(digestsDirectory?: string) {
  if (digestsDirectory !== undefined) return createLocalDigestStore(digestsDirectory);
  if (cloudDatabaseConfigured()) return createCloudDigestStore();
  if (isCloudDeployment()) throw new Error("云端持久数据库尚未连接，请配置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN");
  return createLocalDigestStore();
}
