import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sourceRoutes from "@/app/api/sources/route";
import * as sourceItemRoutes from "@/app/api/sources/[id]/route";
import * as topicRoutes from "@/app/api/topics/route";
import * as topicItemRoutes from "@/app/api/topics/[id]/route";
import * as feedRoutes from "@/app/api/feed/route";
import * as itemRoutes from "@/app/api/items/[id]/route";
import * as exportRoutes from "@/app/api/items/[id]/export/route";
import * as syncRoutes from "@/app/api/sync/route";
import type { Source } from "@/domain/source";
import type { Topic } from "@/domain/topic";
import { openDatabase } from "@/infrastructure/db/connection";
import { SqliteRadarRepository } from "@/infrastructure/db/repository";
import { deduplicateContent } from "@/application/ingestion/deduplicate";
import { analyzeContent } from "@/application/processing/analyze";
import { DevelopmentAIProvider } from "@/infrastructure/ai/development";

const origin = "http://127.0.0.1:3000";
const sourceInput = { name: "Fixture RSS", type: "RSS", urlOrIdentifier: "https://example.com/feed.xml", priority: 4, enabled: true, metadata: { language: "en" } };
const topicInput = { name: "Robotics", description: "Research in embodied AI", keywords: ["robot", "robotics"], weight: 1.8 };
function request(path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, {
    method, headers: { host: "127.0.0.1:3000", ...(data === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function addSource(): Promise<Source> {
  const response = await sourceRoutes.POST(request("/api/sources", "POST", sourceInput));
  expect(response.status).toBe(200);
  return ((await response.json()) as { source: Source }).source;
}

describe("local API routes with isolated SQLite databases", () => {
  let directory: string;
  let filename: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ai-radar-api-"));
    filename = join(directory, "radar.sqlite");
    vi.stubEnv("DATABASE_PATH", filename);
    vi.stubEnv("AI_PROVIDER", "development");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("RADAR_TIMEZONE", "Asia/Shanghai");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    const absolute = resolve(directory);
    const temporaryRoot = resolve(tmpdir());
    if (dirname(absolute) !== temporaryRoot || !absolute.startsWith(join(temporaryRoot, "ai-radar-api-"))) throw new Error("Refusing to remove an unexpected test directory.");
    rmSync(absolute, { recursive: true, force: true });
  });

  it("creates, reads, updates, and deletes a source without resetting omitted fields", async () => {
    const source = await addSource();
    const patched = await sourceItemRoutes.PATCH(request(`/api/sources/${source.id}`, "PATCH", { enabled: false }), context(source.id));
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { source: Source }).source).toMatchObject({ name: sourceInput.name, enabled: false, priority: 4, metadata: { language: "en" } });
    const listed = await sourceRoutes.GET(request("/api/sources"));
    expect(listed.headers.get("cache-control")).toBe("no-store");
    expect(((await listed.json()) as { sources: Source[] }).sources).toHaveLength(1);
    const removed = await sourceItemRoutes.DELETE(request(`/api/sources/${source.id}`, "DELETE"), context(source.id));
    expect(removed.status).toBe(200);
    expect(((await (await sourceRoutes.GET(request("/api/sources"))).json()) as { sources: Source[] }).sources).toEqual([]);
    expect((await sourceItemRoutes.DELETE(request(`/api/sources/${source.id}`, "DELETE"), context(source.id))).status).toBe(404);
    expect((await sourceItemRoutes.PATCH(request(`/api/sources/${source.id}`, "PATCH", { name: "missing" }), context(source.id))).status).toBe(404);
  });

  it.each([
    { name: " " }, { type: "Unsupported" }, { priority: 0 }, { enabled: "true" },
    { urlOrIdentifier: "http://127.0.0.1/private" }, { urlOrIdentifier: "file:///etc/passwd" },
    { type: "GitHub", urlOrIdentifier: "owner/repo?token=x" }, { type: "YouTube", urlOrIdentifier: "@channel" },
  ])("rejects an invalid source without saving it: %j", async (invalid) => {
    const response = await sourceRoutes.POST(request("/api/sources", "POST", { ...sourceInput, ...invalid }));
    expect(response.status).toBe(400);
    expect(((await (await sourceRoutes.GET(request("/api/sources"))).json()) as { sources: Source[] }).sources).toEqual([]);
  });

  it("validates source identity changes as well as creation", async () => {
    const source = await addSource();
    const response = await sourceItemRoutes.PATCH(request(`/api/sources/${source.id}`, "PATCH", { urlOrIdentifier: "http://169.254.169.254/" }), context(source.id));
    expect(response.status).toBe(400);
    const listed = ((await (await sourceRoutes.GET(request("/api/sources"))).json()) as { sources: Source[] }).sources;
    expect(listed[0].urlOrIdentifier).toBe(sourceInput.urlOrIdentifier);
  });

  it("creates, lists, edits, and deletes a research topic", async () => {
    const created = await topicRoutes.POST(request("/api/topics", "POST", topicInput));
    expect(created.status).toBe(200);
    const topic = ((await created.json()) as { topic: Topic }).topic;
    const patched = await topicItemRoutes.PATCH(request(`/api/topics/${topic.id}`, "PATCH", { weight: 2.5 }), context(topic.id));
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { topic: Topic }).topic).toMatchObject({ ...topicInput, weight: 2.5 });
    const listed = ((await (await topicRoutes.GET(request("/api/topics"))).json()) as { topics: Topic[] }).topics;
    expect(listed.some(value => value.id === topic.id)).toBe(true);
    expect((await topicItemRoutes.DELETE(request(`/api/topics/${topic.id}`, "DELETE"), context(topic.id))).status).toBe(200);
    expect((await topicItemRoutes.PATCH(request(`/api/topics/${topic.id}`, "PATCH", { name: "missing" }), context(topic.id))).status).toBe(404);
  });

  it.each([{ name: "" }, { keywords: [] }, { weight: 0 }, { weight: 5.1 }, { weight: "2" }])("rejects an invalid topic: %j", async (invalid) => {
    expect((await topicRoutes.POST(request("/api/topics", "POST", { ...topicInput, ...invalid }))).status).toBe(400);
  });

  it("returns 404 when deleting a topic that does not exist", async () => {
    expect((await topicItemRoutes.DELETE(request("/api/topics/missing", "DELETE"), context("missing"))).status).toBe(404);
  });

  it("returns a valid empty feed for ordinary and escaped literal searches", async () => {
    for (const search of ["agent", "%_\\'"]) {
      const response = await feedRoutes.GET(request(`/api/feed?view=library&search=${encodeURIComponent(search)}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ items: [], total: 0, provider: { name: "development", configured: true } });
    }
  });

  it.each([
    "from=2026-02-30", "from=2026-09-06&to=2026-09-05", "sourceType=Unknown", "limit=101", "offset=-1", "unread=1", `search=${"x".repeat(201)}`,
  ])("rejects invalid feed filters: %s", async (query) => {
    expect((await feedRoutes.GET(request(`/api/feed?view=library&${query}`))).status).toBe(400);
  });

  it("blocks non-local Host headers before performing a mutation", async () => {
    expect((await sourceRoutes.POST(request("/api/sources", "POST", sourceInput, { host: "attacker.example.com" }))).status).toBe(403);
    expect(((await (await sourceRoutes.GET(request("/api/sources"))).json()) as { sources: Source[] }).sources).toEqual([]);
  });

  it("blocks cross-origin writes and permits same-origin writes", async () => {
    expect((await sourceRoutes.POST(request("/api/sources", "POST", sourceInput, { origin: "https://attacker.example.com" }))).status).toBe(403);
    expect((await sourceRoutes.POST(request("/api/sources", "POST", sourceInput, { origin }))).status).toBe(200);
  });

  it("requires JSON content type, rejects malformed JSON, and bounds request bodies", async () => {
    expect((await sourceRoutes.POST(request("/api/sources", "POST", sourceInput, { "content-type": "text/plain" }))).status).toBe(415);
    const malformed = new Request(`${origin}/api/sources`, { method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/json" }, body: "{" });
    expect((await sourceRoutes.POST(malformed)).status).toBe(400);
    const tooLarge = { ...sourceInput, metadata: { text: "x".repeat(16_384) } };
    expect((await sourceRoutes.POST(request("/api/sources", "POST", tooLarge))).status).toBe(413);
  });

  it("validates sync parameters before making any network request", async () => {
    expect((await syncRoutes.POST(request("/api/sync", "POST", { retry: "true" }))).status).toBe(400);
    expect((await syncRoutes.POST(request("/api/sync", "POST", { unexpected: true }))).status).toBe(400);
    expect((await syncRoutes.POST(request("/api/sync", "POST", { sourceId: "missing" }))).status).toBe(404);
  });

  it.each([{ favorite: "true" }, { read: 1 }, {}, { unknown: true }])("rejects invalid item flags: %j", async (flags) => {
    expect((await itemRoutes.PATCH(request("/api/items/missing", "PATCH", flags), context("missing"))).status).toBe(400);
  });

  it("returns 404 for missing item detail, mutation, and Markdown export", async () => {
    expect((await itemRoutes.GET(request("/api/items/missing"), context("missing"))).status).toBe(404);
    expect((await itemRoutes.PATCH(request("/api/items/missing", "PATCH", { read: true }), context("missing"))).status).toBe(404);
    expect((await exportRoutes.GET(request("/api/items/missing/export"), context("missing"))).status).toBe(404);
  });

  it("persists boolean flags, exports stored intelligence, and filters the configured local calendar day", async () => {
    const source = await addSource();
    const connection = openDatabase(filename);
    let id: string;
    try {
      const repository = new SqliteRadarRepository(connection);
      const result = await deduplicateContent(repository, {
        sourceId: source.id, sourceType: "RSS", externalId: "article-1", title: "Agent memory release", author: "Fixture",
        url: "https://example.com/article-1", publishedAt: "2026-09-04T16:30:00.000Z", rawContent: "Raw source snapshot",
        normalizedContent: "Agent memory adds local retrieval.", language: "en", fetchedAt: "2026-09-05T00:00:00.000Z",
      });
      id = result.content.id;
      await analyzeContent(repository, new DevelopmentAIProvider(), result.content, repository.listTopics());
    } finally { connection.close(); }
    expect((await itemRoutes.PATCH(request(`/api/items/${id}`, "PATCH", { favorite: true, read: true }), context(id))).status).toBe(200);
    const detail = await itemRoutes.GET(request(`/api/items/${id}`), context(id));
    expect(await detail.json()).toMatchObject({ item: { favorite: true, read: true }, observations: [expect.objectContaining({ rawContent: "Raw source snapshot" })] });
    const filtered = await feedRoutes.GET(request("/api/feed?view=library&from=2026-09-05&to=2026-09-05&favorite=true"));
    expect(await filtered.json()).toMatchObject({ total: 1 });
    const exported = await exportRoutes.GET(request(`/api/items/${id}/export`), context(id));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("text/markdown");
    expect(exported.headers.get("content-disposition")).toContain("attachment;");
    expect(await exported.text()).toContain("> Agent memory adds local retrieval\\.");
  });
});
