import "./env";
import { existsSync } from "node:fs";

// Publishing credentials are scoped to CLI commands. The local web workspace
// continues to use its original SQLite database and selection files.
if (existsSync(".env.cloud.local")) process.loadEnvFile(".env.cloud.local");
