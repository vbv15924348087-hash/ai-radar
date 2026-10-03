import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isCloudDeployment } from "@/infrastructure/deployment";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const COOKIE = "radar_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
export function workspaceAccessMode(): "private" | "public" | "readonly" {
  const value = process.env.RADAR_ACCESS_MODE?.trim() || "private";
  if (value !== "private" && value !== "public" && value !== "readonly") throw new HttpError(503, "RADAR_ACCESS_MODE 配置无效");
  return value;
}
function password() {
  const value = process.env.RADAR_ADMIN_PASSWORD;
  if (!value || value.length < 16) throw new HttpError(503, "云端工作区尚未配置访问口令（RADAR_ADMIN_PASSWORD，至少 16 位）");
  return value;
}
function digest(value: string) { return createHash("sha256").update(value).digest(); }
function sign(value: string) { return createHmac("sha256", password()).update(`radar-session:${value}`).digest("hex"); }
export function passwordMatches(value: string) { return timingSafeEqual(digest(value), digest(password())); }
export function sessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${COOKIE}=${expires}.${sign(expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
export function clearSessionCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
export function hasSession(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, signature, extra] = value.split(".");
  if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  if (Number(expires) <= Date.now() / 1000 || Number(expires) > Date.now() / 1000 + SESSION_SECONDS + 60) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(expires), "hex"));
}

export function checkRequestAccess(request: Request, sessionRequired = true) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (isCloudDeployment()) {
    const allowed = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL,
      ...((process.env.RADAR_PUBLIC_ORIGIN ?? "").split(","))].filter(Boolean).map(value => {
        try { return new URL(value!.includes("://") ? value! : `https://${value}`).host; } catch { return ""; }
      });
    if (!allowed.includes(host)) throw new HttpError(403, "该域名尚未配置为云端工作区入口");
  } else if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    throw new HttpError(403, "仅允许本机访问");
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let originUrl: URL;
      try { originUrl = new URL(origin); } catch { throw new HttpError(403, "不允许跨站修改数据"); }
      if (originUrl.host !== host || (isCloudDeployment() && originUrl.protocol !== "https:")) throw new HttpError(403, "不允许跨站修改数据");
    }
  }
  if (isCloudDeployment() && sessionRequired) {
    const mode = workspaceAccessMode();
    if (mode === "public") return;
    if (mode === "readonly") {
      if (!["GET", "HEAD"].includes(request.method)) throw new HttpError(403, "当前工作区仅开放阅读，不能修改数据");
      return;
    }
    password();
    if (!hasSession(request)) throw new HttpError(401, "请先解锁云端工作区");
  }
}
