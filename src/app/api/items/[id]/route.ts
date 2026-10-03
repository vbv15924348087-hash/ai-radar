import { z } from "zod";
import { endpoint, HttpError, jsonBody, type RouteContext } from "../../http";
const flagsSchema = z.object({ favorite: z.boolean().optional(), read: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0, "至少指定一个阅读或收藏状态");
export function GET(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => {
    const { id } = await context.params;
    const item = repository.getItem(id);
    if (!item) throw new HttpError(404, "情报不存在");
    return { item, observations: repository.observations(id) };
  });
}
export function PATCH(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => { repository.updateItem((await context.params).id, await jsonBody(request, flagsSchema)); return { ok: true }; });
}
