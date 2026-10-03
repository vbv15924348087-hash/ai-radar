import { basename, dirname, resolve } from "node:path";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";

export interface ClosableTestConnection { close(): void | Promise<void> }

/** Close libSQL clients, collect native SQLite statements, then remove only a checked temp fixture. */
export async function cleanupSqliteTestDirectory(directory: string, requiredPrefix: string,
  connections: readonly ClosableTestConnection[] = []): Promise<void> {
  const absolute = resolve(directory);
  const temporaryRoot = resolve(tmpdir());
  if (dirname(absolute) !== temporaryRoot || !basename(absolute).startsWith(requiredPrefix)) {
    throw new Error("Refusing to remove an unexpected SQLite test directory.");
  }

  await Promise.all(connections.map(connection => connection.close()));
  const collectGarbage = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (!collectGarbage) throw new Error("SQLite file tests must run with Node --expose-gc for native handle cleanup.");

  for (let attempt = 0; attempt < 6; attempt++) {
    collectGarbage();
    collectGarbage();
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50 * (attempt + 1)));
    try {
      rmSync(absolute, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!(["EPERM", "EBUSY", "ENOTEMPTY"].includes(code)) || attempt === 5) throw error;
    }
  }
}
