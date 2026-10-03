import { createDigestStore } from "@/infrastructure/digests/store";
import { endpoint } from "../http";

export function GET(request: Request) {
  return endpoint(request, async () => ({ digests: await createDigestStore().listDigests() }));
}
