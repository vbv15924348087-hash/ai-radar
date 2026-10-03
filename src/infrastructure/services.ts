import type { AIProvider } from "@/application/ports";
import type { RadarRepository } from "@/application/repository";
import { SourceSyncService } from "@/application/ingestion/source-sync-service";
import { createAdapterRegistry } from "./adapters";
import { createAIProvider } from "./ai";
import { openDatabase } from "./db/connection";
import { SqliteRadarRepository } from "./db/repository";
import { openLibsqlDatabase } from "./db/libsql-connection";
import { LibsqlRadarRepository } from "./db/libsql-repository";
import { cloudDatabaseConfigured, isCloudDeployment } from "./deployment";

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
  return { repository, sync, close: () => { connection.close(); } };
}
export type Services = ReturnType<typeof createServices>;
export interface RequestServices {
  repository: RadarRepository;
  sync: SourceSyncService;
  close: () => void | Promise<void>;
}
export async function createRequestServices(): Promise<RequestServices> {
  if (cloudDatabaseConfigured()) {
    const connection = await openLibsqlDatabase();
    const repository = new LibsqlRadarRepository(connection);
    return { repository, sync: new SourceSyncService(repository, createAdapterRegistry(), configuredProvider()), close: connection.close };
  }
  if (isCloudDeployment()) throw new Error("云端持久数据库尚未连接，请配置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN");
  return createServices();
}
