import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestServices, type RequestServices } from "@/infrastructure/services";
import { SyncBusyError } from "@/application/ingestion/source-sync-service";
import { checkRequestAccess, HttpError } from "./access";
export { HttpError } from "./access";
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
export async function endpoint(request: Request, action: (services: RequestServices) => unknown | Promise<unknown>): Promise<Response> {
  return dataEndpoint(request, async () => {
    const services = await createRequestServices();
    try { return await action(services); } finally { await services.close(); }
  });
}
/** Digest and session requests do not open or initialize the ingestion database. */
export async function dataEndpoint(request: Request, action: () => unknown | Promise<unknown>, sessionRequired = true): Promise<Response> {
  try {
    checkRequestAccess(request, sessionRequired);
    const result = await action();
    return result instanceof Response ? result : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("；") }, { status: 400 });
    const message = error instanceof Error ? error.message : "请求失败";
    const status = error instanceof HttpError ? error.status : error instanceof SyncBusyError ? 409 : /不存在/.test(message) ? 404 : 400;
    return NextResponse.json({ error: message.slice(0, 800) }, { status });
  }
}
export type RouteContext = { params: Promise<{ id: string }> };
