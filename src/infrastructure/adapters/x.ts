import type { SourceAdapter } from "@/application/ports";
import type { RawItem } from "@/domain/content";
import type { Source } from "@/domain/source";
import type { PublicHttpClient } from "@/infrastructure/http/public-http";
import { draft, list, object, parseDate, parseJson, scalar } from "./common";
import { xUsername } from "./locations";

export class XAdapter implements SourceAdapter {
  constructor(private readonly http: PublicHttpClient, private readonly token?: string, private readonly now: () => Date = () => new Date()) {}
  async discover(source: Source): Promise<RawItem[]> {
    if (!this.token?.trim()) throw new Error("X source requires X_BEARER_TOKEN and an X API plan with user timeline access. Configure credentials before syncing.");
    const username = xUsername(source.urlOrIdentifier);
    const headers = { authorization: `Bearer ${this.token}`, accept: "application/json" };
    const profileResponse = await this.http(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, { headers });
    const profile = parseJson(profileResponse.body);
    const userId = scalar(object(profile.data).id);
    if (!/^\d+$/.test(userId)) throw new Error("X did not return a valid user profile; verify the username and API access.");
    const response = await this.http(`https://api.x.com/2/users/${userId}/tweets?max_results=30&tweet.fields=created_at,lang,author_id,entities`, { headers });
    const timeline = parseJson(response.body);
    if (timeline.errors && !timeline.data) throw new Error("X could not return the timeline; verify the account and API plan permissions.");
    if (timeline.data !== undefined && !Array.isArray(timeline.data)) throw new Error("X returned an unexpected timeline response.");
    return list(timeline.data).slice(0, 30).flatMap((input) => {
      const tweet = object(input);
      const id = scalar(tweet.id);
      if (!/^\d+$/.test(id)) return [];
      return [{ externalId: id, url: `https://x.com/${username}/status/${id}`, payload: { username, user: profile.data, tweet } }];
    });
  }
  async fetch(raw: RawItem, _source: Source): Promise<RawItem> { return raw; }
  normalize(raw: RawItem, source: Source) {
    const payload = object(raw.payload);
    const tweet = object(payload.tweet);
    const text = scalar(tweet.text);
    return draft(raw, source, {
      title: text.slice(0, 160), author: `@${scalar(payload.username)}`, text,
      publishedAt: parseDate(tweet.created_at), language: scalar(tweet.lang),
    }, this.now);
  }
}
