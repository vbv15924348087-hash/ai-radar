import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/**": ["./src/infrastructure/db/migrations/*.sql"],
    "/api/digests": ["./woshipm-daily/digests/*.json"],
    "/api/digests/*": ["./woshipm-daily/digests/*.json"],
  },
};
export default nextConfig;
