import { FeedWorkbench } from "@/ui/feed/feed-workbench";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ topic?: string; favorite?: string }> }) {
  const params = await searchParams;
  return <FeedWorkbench key={`${params.topic ?? ""}:${params.favorite ?? ""}`} view="library" initialTopic={params.topic ?? ""} savedView={params.favorite === "true"} />;
}

