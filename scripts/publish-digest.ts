import "./cloud-env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dailyDigestSchema } from "../src/infrastructure/digests/store";
import { createCloudDigestStore } from "../src/infrastructure/digests/cloud-store";

async function main() {
  const input = process.argv[2];
  if (!input || process.argv.length > 3) throw new Error("用法：npm run digest:publish -- 简报JSON文件路径");
  if (!process.env.TURSO_DATABASE_URL?.trim()) throw new Error("发布前请配置 TURSO_DATABASE_URL");
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) throw new Error("发布前请配置 TURSO_AUTH_TOKEN");

  let value: unknown;
  try { value = JSON.parse((await readFile(resolve(input), "utf8")).replace(/^\uFEFF/, "")); }
  catch { throw new Error("简报 JSON 文件无法读取或格式无效"); }
  const digest = dailyDigestSchema.parse(value);
  await createCloudDigestStore().writeDigest(digest);
  console.log(JSON.stringify({ published: true, date: digest.date, items: digest.items.length }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "发布简报失败");
  process.exitCode = 1;
});
