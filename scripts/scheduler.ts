import "./env";
import { setTimeout } from "node:timers/promises";
import { createServices } from "../src/infrastructure/services";

const minutes = Number(process.env.SYNC_INTERVAL_MINUTES || "60");
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error("SYNC_INTERVAL_MINUTES 必须为 1–1440");
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());
async function main() {
  while (!stop.signal.aborted) {
    const services = createServices();
    try { await services.sync.sync(); }
    catch (error) { console.error(JSON.stringify({ event: "scheduler_error", error: error instanceof Error ? error.message : "同步失败" })); }
    finally { services.close(); }
    try { await setTimeout(minutes * 60_000, undefined, { signal: stop.signal }); }
    catch { break; }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Scheduler failed"); process.exitCode = 1; });
