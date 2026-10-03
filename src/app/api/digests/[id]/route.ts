import { createDigestStore } from "@/infrastructure/digests/store";
import { endpoint, type RouteContext } from "../../http";

export function GET(request: Request, context: RouteContext) {
  return endpoint(request, async () => createDigestStore().readDigestWithSelection((await context.params).id));
}
