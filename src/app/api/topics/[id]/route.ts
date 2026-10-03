import { topicUpdateSchema } from "@/domain/topic";
import { endpoint, jsonBody, type RouteContext } from "../../http";
export function PATCH(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => ({ topic: await repository.updateTopic((await context.params).id, await jsonBody(request, topicUpdateSchema)) }));
}
export function DELETE(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => { await repository.deleteTopic((await context.params).id); return { ok: true }; });
}
