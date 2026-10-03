import { existsSync } from "node:fs";
for (const filename of [".env.local", ".env"]) if (existsSync(filename)) process.loadEnvFile(filename);
