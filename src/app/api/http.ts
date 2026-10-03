import { NextResponse } from "next/server";
import { z } from "zod";
import { createServices, type Services } from "@/infrastructure/services";
import { SyncBusyError } from "@/application/ingestion/source-sync-service";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function checkLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new HttpError(403, "仅允许本机访问");
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== host) throw new HttpError(403, "不允许跨站修改数据");
  }
}
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "请求必须使用 application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "缺少请求数据");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new HttpError(413, "请求数据过大"); }
    chunks.push(value);
  }
  let data: unknown;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "JSON 格式无效"); }
  return schema.parse(data);
}
export async function endpoint(request: Request, action: (services: Services) => unknown | Promise<unknown>): Promise<Response> {
  let services: Services | undefined;
  try {
    checkLocalRequest(request);
    services = createServices();
    const result = await action(services);
    return result instanceof Response ? result : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("；") }, { status: 400 });
    const message = error instanceof Error ? error.message : "请求失败";
    const status = error instanceof HttpError ? error.status : error instanceof SyncBusyError ? 409 : /不存在/.test(message) ? 404 : 400;
    return NextResponse.json({ error: message.slice(0, 800) }, { status });
  } finally { services?.close(); }
}
export type RouteContext = { params: Promise<{ id: string }> };
