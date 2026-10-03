import { sourceInputSchema } from "@/domain/source";
import { validateSourceLocation } from "@/infrastructure/adapters";
import { providerStatus } from "@/infrastructure/services";
import { endpoint, jsonBody } from "../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return endpoint(request, async ({ repository }) => ({ sources: await repository.listSources(), provider: providerStatus() }));
}
export function POST(request: Request) {
  return endpoint(request, async ({ repository }) => {
    const input = await jsonBody(request, sourceInputSchema);
    validateSourceLocation(input.type, input.urlOrIdentifier);
    return { source: await repository.addSource(input) };
  });
}
