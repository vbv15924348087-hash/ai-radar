import { sourceInputSchema, sourceUpdateSchema } from "@/domain/source";
import { validateSourceLocation } from "@/infrastructure/adapters";
import { endpoint, jsonBody, HttpError, type RouteContext } from "../../http";
export function PATCH(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => {
    const { id } = await context.params;
    const existing = repository.getSource(id);
    if (!existing) throw new HttpError(404, "来源不存在");
    const input = await jsonBody(request, sourceUpdateSchema);
    const merged = sourceInputSchema.parse({ ...existing, ...input });
    validateSourceLocation(merged.type, merged.urlOrIdentifier);
    return { source: repository.updateSource(id, merged) };
  });
}
export function DELETE(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => { repository.deleteSource((await context.params).id); return { ok: true }; });
}
