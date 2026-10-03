import { z } from "zod";
import { endpoint, jsonBody } from "../http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export function GET(request: Request) { return endpoint(request, ({ repository }) => ({ runs: repository.listRuns() })); }
export function POST(request: Request) {
  return endpoint(request, async ({ sync }) => ({ runs: await sync.sync(await jsonBody(request, z.object({ sourceId: z.string().min(1).optional(), retry: z.boolean().optional() }).strict())) }));
}
