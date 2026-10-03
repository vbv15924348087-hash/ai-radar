import { topicInputSchema } from "@/domain/topic";
import { endpoint, jsonBody } from "../http";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return endpoint(request, ({ repository }) => ({ topics: repository.listTopics() })); }
export function POST(request: Request) {
  return endpoint(request, async ({ repository }) => ({ topic: repository.addTopic(await jsonBody(request, topicInputSchema)) }));
}
