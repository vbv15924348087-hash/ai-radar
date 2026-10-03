import { createDigestStore } from "@/infrastructure/digests/store";
import { dataEndpoint, type RouteContext } from "../../http";
import { cloudDatabaseConfigured } from "@/infrastructure/deployment";

export function GET(request: Request, context: RouteContext) {
  return dataEndpoint(request, async () => ({ ...await createDigestStore().readDigestWithSelection((await context.params).id), storage: cloudDatabaseConfigured() ? "cloud" : "local" }));
}
