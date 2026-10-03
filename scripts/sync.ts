import "./env";
import { createServices } from "../src/infrastructure/services";

async function main() {
  const sourceId = process.argv.find(argument => argument.startsWith("--source="))?.slice("--source=".length);
  const services = createServices();
  try {
    const runs = await services.sync.sync({ sourceId, retry: process.argv.includes("--retry") });
    console.log(JSON.stringify({ runs }, null, 2));
    if (runs.some(run => run.failed > 0)) process.exitCode = 1;
  } finally { services.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sync failed"); process.exitCode = 1; });
