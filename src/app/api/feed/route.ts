import { z } from "zod";
import { SOURCE_TYPES } from "@/domain/source";
import { startOfToday, startOfDay, endOfDay } from "@/application/time";
import { providerStatus } from "@/infrastructure/services";
import { endpoint, HttpError } from "../http";
const date = z.iso.date().optional();
const querySchema = z.object({
  view: z.enum(["today", "library"]).default("today"), search: z.string().max(200).optional(), topic: z.string().max(100).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(), from: date, to: date,
  favorite: z.enum(["true", "false"]).optional(), unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return endpoint(request, async ({ repository }) => {
    const params = Object.fromEntries([...new URL(request.url).searchParams].filter(([, value]) => value !== ""));
    const query = querySchema.parse(params);
    if (query.from && query.to && query.from > query.to) throw new HttpError(400, "开始日期不能晚于结束日期");
    const since = startOfToday();
    const result = await repository.feed({ ...query, favorite: query.favorite === "true", unread: query.unread === "true",
      from: query.from ? startOfDay(query.from) : undefined, to: query.to ? endOfDay(query.to) : undefined,
      processedFrom: query.view === "today" ? since : undefined, limit: query.view === "today" ? 10 : query.limit ?? 30 });
    return { ...result, metrics: await repository.dailyMetrics(since), provider: providerStatus(), lastRun: (await repository.listRuns(1))[0] ?? null };
  });
}
