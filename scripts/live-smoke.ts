import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServices } from "../src/infrastructure/services";
import { sourceInputSchema } from "../src/domain/source";
import { exportMarkdown } from "../src/application/library/markdown";

async function main() {
  // This opt-in smoke exercises real network content in an isolated disposable DB.
  mkdirSync(".qa", { recursive: true });
  const database = resolve(`.qa/live-${Date.now()}.sqlite`);
  const services = createServices(database);
  try {
    const source = services.repository.addSource(sourceInputSchema.parse({ name: "OpenAI News", type: "RSS", urlOrIdentifier: "https://openai.com/news/rss.xml" }));
    const first = await services.sync.sync({ sourceId: source.id });
    const second = await services.sync.sync({ sourceId: source.id });
    const feed = services.repository.feed({ limit: 10 });
    if (!feed.items.length || first[0].analyzed < 1 || second[0].duplicates < 1 || second[0].analyzed !== 0 || first[0].failed || second[0].failed) {
      throw new Error(`Live smoke did not pass: ${JSON.stringify({ first, second, total: feed.total })}`);
    }
    const markdown = exportMarkdown(feed.items[0]);
    writeFileSync(".qa/live-example.md", markdown, "utf8");
    const evidence = { checkedAt: new Date().toISOString(), database, source: source.urlOrIdentifier,
      firstRun: first[0], secondRun: second[0], stored: feed.total, sampleTitle: feed.items[0].content.title,
      sampleUrl: feed.items[0].content.url, provider: feed.items[0].provider };
    writeFileSync(".qa/live-result.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { services.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Live smoke failed"); process.exitCode = 1; });
