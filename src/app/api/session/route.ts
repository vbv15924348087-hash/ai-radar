import { NextResponse } from "next/server";
import { z } from "zod";
import { isCloudDeployment } from "@/infrastructure/deployment";
import { clearSessionCookie, hasSession, passwordMatches, sessionCookie, workspaceAccessMode } from "../access";
import { dataEndpoint, HttpError, jsonBody } from "../http";

export function GET(request: Request) {
  return dataEndpoint(request, () => ({ cloud: isCloudDeployment(), accessMode: workspaceAccessMode(), authenticated: !isCloudDeployment() || workspaceAccessMode() !== "private" || hasSession(request) }), false);
}
export function POST(request: Request) {
  return dataEndpoint(request, async () => {
    const { password } = await jsonBody(request, z.object({ password: z.string().min(1).max(512) }).strict());
    if (!isCloudDeployment()) throw new HttpError(400, "本地工作区无需解锁");
    if (workspaceAccessMode() !== "private") return { authenticated: true };
    if (!passwordMatches(password)) throw new HttpError(401, "访问口令不正确");
    return NextResponse.json({ authenticated: true }, { headers: { "Set-Cookie": sessionCookie(), "Cache-Control": "no-store" } });
  }, false);
}
export function DELETE(request: Request) {
  return dataEndpoint(request, () => NextResponse.json({ authenticated: false }, { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } }));
}
