import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCloudDigestStore } from "@/infrastructure/digests/cloud-store";
import { createLocalDigestStore } from "@/infrastructure/digests/store";
import type { DailyDigest } from "@/domain/digest";
import { cleanupSqliteTestDirectory } from "./helpers/sqlite-test-cleanup";

const digest: DailyDigest = { date: "2026-10-03", title: "核验后的测试简报", intro: "测试事实", generatedAt: "2026-10-03T20:00:00+08:00", windowStart: "2026-10-02T20:00:00+08:00", coverageNotes: [], items: [{ id: "2026-10-03-01", title: "测试材料", source: "官方来源", sourceUrl: "https://example.com/news", publishedAt: "2026-10-03", freshness: "24h", category: "Agent", summary: "可核验事实", whyItMatters: "产品影响", angle: "实战角度", caveat: "测试", evidence: [{ url: "https://example.com/news", quote: "Evidence" }], recommended: true }] };
describe("cloud digests retain explicit user choices", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "radar-cloud-digests-"));
    vi.stubEnv("TURSO_DATABASE_URL", pathToFileURL(join(directory, "cloud.sqlite")).href);
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupSqliteTestDirectory(directory, "radar-cloud-digests-");
  });
  it("falls back to bundled digests without copying local selections or adopting recommendations", async () => {
    const local = createLocalDigestStore(join(directory, "bundled", "digests"));
    await local.writeDigest(digest); await local.saveSelection(digest.date, { selectedIds: [digest.items[0].id], angle: "本地已有意图" });
    const cloud = createCloudDigestStore(join(directory, "bundled", "digests"));
    expect((await cloud.listDigests())[0].count).toBe(1);
    expect((await cloud.readDigestWithSelection(digest.date)).selection).toMatchObject({ selectedIds: [], updatedAt: null });
  });
  it("persists selections across clients and does not erase them on a digest update", async () => {
    const directoryPath = join(directory, "bundled", "digests");
    const cloud = createCloudDigestStore(directoryPath);
    await cloud.writeDigest(digest);
    const saved = await cloud.saveSelection(digest.date, { selectedIds: [digest.items[0].id], angle: "测试选题" });
    await cloud.writeDigest({ ...digest, title: "更新后的标题" });
    const reopened = createCloudDigestStore(directoryPath);
    expect(await reopened.readSelection(digest.date)).toEqual(saved);
    await expect(reopened.saveSelection(digest.date, { selectedIds: ["missing"], angle: "" })).rejects.toThrow("不属于");
    expect(await reopened.readSelection(digest.date)).toEqual(saved);
    expect((await reopened.listDigests())[0].title).toBe("更新后的标题");
  });
});
