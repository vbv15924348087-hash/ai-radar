import type { AIProvider } from "@/application/ports";
import { SourceSyncService } from "@/application/ingestion/source-sync-service";
import { createAdapterRegistry } from "./adapters";
import { createAIProvider } from "./ai";
import { openDatabase } from "./db/connection";
import { SqliteRadarRepository } from "./db/repository";

export function providerStatus() {
  const name = process.env.AI_PROVIDER?.trim() || (process.env.OPENAI_API_KEY?.trim() ? "openai" : "development");
  return { name, development: name === "development", configured: name === "development" || (name === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim())) };
}
function configuredProvider(): AIProvider {
  try { return createAIProvider(); }
  catch (error) {
    // Configuration failure still allows real raw-content ingestion and a retry later.
    return { name: providerStatus().name, version: "unconfigured", analyze: async () => { throw error; } };
  }
}
export function createServices(filename?: string) {
  const connection = openDatabase(filename);
  const repository = new SqliteRadarRepository(connection);
  const sync = new SourceSyncService(repository, createAdapterRegistry(), configuredProvider());
  return { repository, sync, close: connection.close };
}
export type Services = ReturnType<typeof createServices>;
