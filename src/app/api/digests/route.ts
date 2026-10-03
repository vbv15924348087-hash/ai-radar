import { createDigestStore } from "@/infrastructure/digests/store";
import { dataEndpoint } from "../http";

export function GET(request: Request) {
  return dataEndpoint(request, async () => ({ digests: await createDigestStore().listDigests() }));
}
