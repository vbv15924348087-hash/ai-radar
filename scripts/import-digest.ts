import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDigestStore } from "../src/infrastructure/digests/store";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("用法：npm run digest:import -- 简报JSON文件路径");
  const value: unknown = JSON.parse((await readFile(resolve(input), "utf8")).replace(/^\uFEFF/, ""));
  const digest = await createDigestStore().writeDigest(value);
  const freshness = { "24h": "24 小时内", "72h": "近 72 小时", "7d": "本周补充" };
  const markdown = [
    `# ${digest.date} · 每日权威 AI 资讯精选`,
    `\n${digest.title}\n\n${digest.intro}`,
    `\n检索截止：${digest.generatedAt}。优先覆盖起点：${digest.windowStart}。`,
    ...digest.items.map((item, index) => `\n## ${String(index + 1).padStart(2, "0")} · ${item.title}\n\n编号：${item.id}｜原文日期：${item.publishedAt}｜${freshness[item.freshness]}｜${item.source}\n\n${item.summary}\n\n**产品经理视角：**${item.whyItMatters}\n\n**可写角度：**${item.angle}\n\n**核验边界：**${item.caveat}\n\n[阅读原文](${item.sourceUrl})\n\n${item.evidence.map(evidence => `> ${evidence.quote}\n\n[原始依据](${evidence.url})`).join("\n\n")}`),
    "\n## 检索覆盖与选题建议\n",
    ...digest.coverageNotes.map(note => `- ${note}`),
    "\n在 AI Radar 的「每日精选」勾选并保存素材，再回到任务说明写作方向。\n",
  ].join("\n");
  const markdownPath = join(process.cwd(), "woshipm-daily", "digests", `${digest.date}.md`);
  await writeFile(markdownPath, markdown, "utf8");
  console.log(JSON.stringify({ date: digest.date, items: digest.items.length, markdownPath, page: "http://127.0.0.1:3000/briefings" }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "导入简报失败"); process.exitCode = 1; });
