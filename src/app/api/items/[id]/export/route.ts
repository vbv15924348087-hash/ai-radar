import { exportMarkdown } from "@/application/library/markdown";
import { endpoint, HttpError, type RouteContext } from "../../../http";
export function GET(request: Request, context: RouteContext) {
  return endpoint(request, async ({ repository }) => {
    const item = await repository.getItem((await context.params).id);
    if (!item) throw new HttpError(404, "情报不存在");
    return new Response(exportMarkdown(item), { headers: {
      "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="ai-radar-${item.contentItemId}.md"`,
    } });
  });
}
