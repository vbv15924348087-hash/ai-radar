export function isCloudDeployment() {
  return process.env.VERCEL === "1" || process.env.RADAR_DEPLOYMENT === "cloud";
}

export function cloudDatabaseConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}
