import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DailyDigest, DigestItem } from "@/domain/digest";
import { createDigestStore, dailyDigestSchema, digestDateSchema } from "@/infrastructure/digests/store";

function item(id: string): DigestItem {
  return {
    id, title: `资讯 ${id}`, source: "Official source", sourceUrl: `https://example.com/${id}`,
    publishedAt: "2026-09-05", freshness: "24h", category: "AI 产品", summary: "来源中可核验的事实。",
    whyItMatters: "帮助产品团队理解流程变化。", angle: "从用户交互设计切入。", caveat: "仅对符合条件的账户开放。",
    evidence: [{ url: `https://example.com/${id}`, quote: "The feature is available to eligible accounts." }],
    recommended: true,
  };
}

function digest(date = "2026-09-06"): DailyDigest {
  return {
    date, generatedAt: "2026-09-06T09:00:00+08:00", windowStart: "2026-09-05T09:00:00+08:00",
    title: `${date} AI 资讯精选`, intro: "今天的原始资料和选题方向。", coverageNotes: ["按原文标注发布日期。"],
    items: [item("first"), item("second")],
  };
}

describe("daily digest validation", () => {
  it.each(["../2026-09-06", "2026-09-06/other", "2026-09-06\\other", "2026-02-30", "2025-02-29", "2026-13-01", "2026-9-6", "2026-09-06.json"])("rejects invalid dates and paths: %s", date => {
    expect(digestDateSchema.safeParse(date).success).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(digestDateSchema.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects duplicate item IDs and impossible source publication dates", () => {
    expect(dailyDigestSchema.safeParse({ ...digest(), items: [item("same"), item("same")] }).success).toBe(false);
    expect(dailyDigestSchema.safeParse({ ...digest(), items: [{ ...item("first"), publishedAt: "2026-02-30" }] }).success).toBe(false);
  });

  it.each(["javascript:alert(1)", "data:text/html,test", "file:///private", "https://user:password@example.com/news", "http://127.0.0.1/private", "http://169.254.169.254/", "http://[::1]/", "https://localhost/", "https://example.com:8080/news"])("rejects unsafe source and evidence URLs: %s", url => {
    expect(dailyDigestSchema.safeParse({ ...digest(), items: [{ ...item("first"), sourceUrl: url }] }).success).toBe(false);
    expect(dailyDigestSchema.safeParse({ ...digest(), items: [{ ...item("first"), evidence: [{ url, quote: "A quote" }] }] }).success).toBe(false);
  });

  it("requires valid timestamps and a non-reversed research window", () => {
    expect(dailyDigestSchema.safeParse({ ...digest(), generatedAt: "today" }).success).toBe(false);
    expect(dailyDigestSchema.safeParse({ ...digest(), windowStart: "2026-09-07T09:00:00+08:00" }).success).toBe(false);
  });
});

describe("file-backed digest and selection storage", () => {
  let directory: string;
  let digestDirectory: string;
  let store: ReturnType<typeof createDigestStore>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-radar-digests-"));
    digestDirectory = join(directory, "digests");
    store = createDigestStore(digestDirectory);
  });

  afterEach(async () => {
    const absolute = resolve(directory);
    const temporaryRoot = resolve(tmpdir());
    if (dirname(absolute) !== temporaryRoot || !absolute.startsWith(join(temporaryRoot, "ai-radar-digests-"))) {
      throw new Error("Refusing to remove an unexpected test directory.");
    }
    await rm(absolute, { recursive: true, force: true });
  });

  it("returns an empty index when no digest exists", async () => {
    expect(await store.listDigests()).toEqual([]);
    await expect(store.readDigest("2026-09-06")).rejects.toThrow("不存在");
  });

  it("does not create selections or adopt recommendations on a read", async () => {
    await store.writeDigest(digest());
    expect((await store.readDigestWithSelection("2026-09-06")).selection).toEqual({
      date: "2026-09-06", selectedIds: [], angle: "", updatedAt: null,
    });
    expect(existsSync(join(directory, "selections"))).toBe(false);
  });

  it("persists the digest and selection separately across store instances", async () => {
    const original = digest();
    await store.writeDigest(original);
    const saved = await store.saveSelection(original.date, { selectedIds: ["second"], angle: "产品工作流的变化" });
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const reopened = createDigestStore(digestDirectory);
    expect(await reopened.readDigest(original.date)).toEqual(original);
    expect(await reopened.readSelection(original.date)).toEqual(saved);
    expect(JSON.parse(await readFile(join(directory, "selections", `${original.date}.json`), "utf8"))).toEqual(saved);
    expect(await readdir(digestDirectory)).toEqual([`${original.date}.json`]);
    expect(await readdir(join(directory, "selections"))).toEqual([`${original.date}.json`]);
  });

  it("does not reset existing user selections when research is replaced", async () => {
    await store.writeDigest(digest());
    const saved = await store.saveSelection("2026-09-06", { selectedIds: ["second"], angle: "保留用户写下的方向" });
    const selectionFile = join(directory, "selections", "2026-09-06.json");
    const originalBytes = await readFile(selectionFile, "utf8");
    await store.writeDigest({ ...digest(), intro: "补充核验后的资料。", items: [item("third")] });
    expect(await store.readDigestWithSelection("2026-09-06")).toMatchObject({
      digest: { items: [{ id: "third" }] }, selection: saved,
    });
    expect(await readFile(selectionFile, "utf8")).toBe(originalBytes);
  });

  it("rejects duplicate or unknown choices without overwriting saved selections", async () => {
    await store.writeDigest(digest());
    const saved = await store.saveSelection("2026-09-06", { selectedIds: ["first"], angle: "已有方向" });
    await expect(store.saveSelection("2026-09-06", { selectedIds: ["second", "second"], angle: "" })).rejects.toThrow("重复");
    await expect(store.saveSelection("2026-09-06", { selectedIds: ["missing"], angle: "" })).rejects.toThrow("不属于");
    expect(await store.readSelection("2026-09-06")).toEqual(saved);
  });

  it("allows an explicit empty selection to clear previous choices", async () => {
    await store.writeDigest(digest());
    await store.saveSelection("2026-09-06", { selectedIds: ["first"], angle: "已有方向" });
    await store.saveSelection("2026-09-06", { selectedIds: [], angle: "" });
    expect(await createDigestStore(digestDirectory).readSelection("2026-09-06")).toMatchObject({ selectedIds: [], angle: "" });
  });

  it("lists valid digest dates newest first and ignores non-digest files", async () => {
    await store.writeDigest(digest("2026-09-05"));
    await store.writeDigest(digest("2026-09-06"));
    await writeFile(join(digestDirectory, "2026-02-30.json"), "{}");
    await writeFile(join(digestDirectory, ".in-progress.tmp"), "{}");
    expect((await store.listDigests()).map(entry => ({ date: entry.date, count: entry.count }))).toEqual([
      { date: "2026-09-06", count: 2 }, { date: "2026-09-05", count: 2 },
    ]);
  });

  it("validates read boundaries and rejects a mismatched file date", async () => {
    await store.writeDigest(digest());
    await expect(store.readDigest("../2026-09-06")).rejects.toThrow();
    await expect(store.readSelection("..\\2026-09-06")).rejects.toThrow();
    await expect(store.writeDigest({ ...digest(), date: "../outside" })).rejects.toThrow();
    await writeFile(join(digestDirectory, "2026-09-06.json"), JSON.stringify(digest("2026-09-05")));
    await expect(store.readDigest("2026-09-06")).rejects.toThrow("日期与文件名不一致");
    expect(await readdir(directory)).toEqual(["digests"]);
  });

  it("validates externally generated JSON on read, including unsafe links", async () => {
    await store.writeDigest(digest());
    await writeFile(join(digestDirectory, "2026-09-06.json"), JSON.stringify({ ...digest(), items: [{ ...item("first"), sourceUrl: "javascript:alert(1)" }] }));
    await expect(store.readDigest("2026-09-06")).rejects.toThrow("安全");
  });
});
