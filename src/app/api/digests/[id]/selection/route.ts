import { createDigestStore, digestSelectionInputSchema } from "@/infrastructure/digests/store";
import { dataEndpoint, jsonBody, type RouteContext } from "../../../http";

export function PUT(request: Request, context: RouteContext) {
  return dataEndpoint(request, async () => ({
    selection: await createDigestStore().saveSelection((await context.params).id, await jsonBody(request, digestSelectionInputSchema)),
  }));
}
