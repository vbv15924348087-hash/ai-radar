import type { SourceAdapter } from "@/application/ports";
import type { SourceType } from "@/domain/source";
import { publicHttpClient, type PublicHttpClient } from "@/infrastructure/http/public-http";
import { FeedAdapter } from "./rss";
import { GitHubAdapter } from "./github";
import { XAdapter } from "./x";
import { paperFeed, youtubeChannel } from "./locations";

export { validateSourceLocation } from "./locations";
export function createAdapterRegistry(options: {
  http?: PublicHttpClient;
  env?: Record<string, string | undefined>;
  now?: () => Date;
} = {}): ReadonlyMap<SourceType, SourceAdapter> {
  const http = options.http ?? publicHttpClient;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  return new Map<SourceType, SourceAdapter>([
    ["RSS", new FeedAdapter(http, undefined, now)],
    ["GitHub", new GitHubAdapter(http, env.GITHUB_TOKEN, now)],
    ["Blog", new FeedAdapter(http, undefined, now)],
    ["Paper", new FeedAdapter(http, (source) => paperFeed(source.urlOrIdentifier), now)],
    ["YouTube", new FeedAdapter(http, (source) => `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannel(source.urlOrIdentifier)}`, now)],
    ["X", new XAdapter(http, env.X_BEARER_TOKEN, now)],
  ]);
}
