import { createDigestStore, digestSelectionInputSchema } from "@/infrastructure/digests/store";
import { endpoint, jsonBody, type RouteContext } from "../../../http";

export function PUT(request: Request, context: RouteContext) {
  return endpoint(request, async () => ({
    selection: await createDigestStore().saveSelection((await context.params).id, await jsonBody(request, digestSelectionInputSchema)),
  }));
}
