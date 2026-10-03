import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupSqliteTestDirectory } from "./helpers/sqlite-test-cleanup";
import { checkRequestAccess, hasSession, sessionCookie } from "@/app/api/access";
import * as sessions from "@/app/api/session/route";
import * as topics from "@/app/api/topics/route";
import * as sources from "@/app/api/sources/route";

const host = "radar.example.com";
const password = "isolated-test-password-with-32-characters";
function request(path: string, method = "GET", body?: unknown, headers: Record<string,string> = {}) {
  return new Request(`https://${host}${path}`, { method, headers: { host, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe("cloud host, session and persistent API", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "radar-cloud-api-"));
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", host);
    vi.stubEnv("RADAR_ADMIN_PASSWORD", password); vi.stubEnv("AI_PROVIDER", "development");
    vi.stubEnv("RADAR_ACCESS_MODE", "private");
    vi.stubEnv("TURSO_DATABASE_URL", pathToFileURL(join(directory, "cloud.sqlite")).href);
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupSqliteTestDirectory(directory, "radar-cloud-api-");
  });
  it("rejects cloud requests before opening data unless the workspace is unlocked", async () => {
    expect((await topics.GET(request("/api/topics"))).status).toBe(401);
    expect(() => checkRequestAccess(new Request("https://other.example.com/api/topics", { headers: { host: "other.example.com" } }))).toThrow("域名");
  });
  it("unlocks with an HttpOnly secure session and rejects wrong passwords and forged cookies", async () => {
    expect((await sessions.POST(request("/api/session", "POST", { password: "wrong" }))).status).toBe(401);
    const response = await sessions.POST(request("/api/session", "POST", { password }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(hasSession(request("/api/topics", "GET", undefined, { cookie: cookie.split(";")[0] }))).toBe(true);
    expect(hasSession(request("/api/topics", "GET", undefined, { cookie: "radar_session=1.invalid" }))).toBe(false);
  });
  it("persists source modifications across independent API connections", async () => {
    const cookie = sessionCookie().split(";")[0];
    const response = await sources.POST(request("/api/sources", "POST", { name: "Official fixture", type: "RSS", urlOrIdentifier: "https://example.com/rss", priority: 5, enabled: true, metadata: {} }, { cookie, origin: `https://${host}` }));
    expect(response.status).toBe(200);
    const source = (await response.json()).source;
    const listed = await sources.GET(request("/api/sources", "GET", undefined, { cookie }));
    expect(await listed.json()).toMatchObject({ sources: [{ id: source.id, name: "Official fixture" }] });
    expect((await sources.POST(request("/api/sources", "POST", {}, { cookie, origin: "https://other.example.com" }))).status).toBe(403);
  });
  it("does not silently replace missing cloud storage with a temporary local database", async () => {
    vi.stubEnv("TURSO_DATABASE_URL", "");
    const response = await topics.GET(request("/api/topics", "GET", undefined, { cookie: sessionCookie().split(";")[0] }));
    expect((await response.json()).error).toContain("云端持久数据库尚未连接");
  });
  it("allows explicitly public access without a password while retaining host and origin checks", async () => {
    vi.stubEnv("RADAR_ACCESS_MODE", "public"); vi.stubEnv("RADAR_ADMIN_PASSWORD", "");
    expect((await topics.GET(request("/api/topics"))).status).toBe(200);
    const created = await sources.POST(request("/api/sources", "POST", { name: "Public fixture", type: "RSS", urlOrIdentifier: "https://example.com/rss", priority: 5, enabled: true, metadata: {} }, { origin: `https://${host}` }));
    expect(created.status).toBe(200);
    expect(await (await sessions.GET(request("/api/session"))).json()).toMatchObject({ accessMode: "public", authenticated: true });
    expect((await sources.POST(request("/api/sources", "POST", {}, { origin: "https://other.example.com" }))).status).toBe(403);
  });
  it("allows readonly access without a password and refuses writes on the server", async () => {
    vi.stubEnv("RADAR_ACCESS_MODE", "readonly"); vi.stubEnv("RADAR_ADMIN_PASSWORD", "");
    expect((await topics.GET(request("/api/topics"))).status).toBe(200);
    expect((await sources.POST(request("/api/sources", "POST", {}, { origin: `https://${host}` }))).status).toBe(403);
  });
});
