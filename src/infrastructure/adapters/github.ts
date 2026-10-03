import type { SourceAdapter } from "@/application/ports";
import type { RawItem } from "@/domain/content";
import type { Source } from "@/domain/source";
import type { PublicHttpClient } from "@/infrastructure/http/public-http";
import { draft, object, parseDate, safeItemUrl, scalar, stableId } from "./common";
import { githubRepository } from "./locations";

// Releases include every binary asset. Ten Codex releases already exceed 2 MB.
const RELEASES_PER_SYNC = 10;

export class GitHubAdapter implements SourceAdapter {
  constructor(private readonly http: PublicHttpClient, private readonly token?: string, private readonly now: () => Date = () => new Date()) {}
  async discover(source: Source): Promise<RawItem[]> {
    const repository = githubRepository(source.urlOrIdentifier);
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await this.http(`https://api.github.com/repos/${repository}/releases?per_page=${RELEASES_PER_SYNC}`, { headers });
    let releases: unknown;
    try { releases = JSON.parse(response.body); } catch { throw new Error("GitHub returned invalid JSON."); }
    if (!Array.isArray(releases)) throw new Error("GitHub returned an unexpected releases response.");
    return releases.slice(0, RELEASES_PER_SYNC).flatMap((input) => {
      const release = object(input);
      const url = safeItemUrl(release.html_url);
      if (!url || release.draft === true) return [];
      return [{ externalId: scalar(release.id) || stableId(repository, scalar(release.tag_name), url), url, payload: { repository, release } }];
    });
  }
  async fetch(raw: RawItem, _source: Source): Promise<RawItem> { return raw; }
  normalize(raw: RawItem, source: Source) {
    const payload = object(raw.payload);
    const release = object(payload.release);
    return draft(raw, source, {
      title: scalar(release.name) || `${scalar(payload.repository)} ${scalar(release.tag_name)}`,
      author: scalar(object(release.author).login), text: scalar(release.body),
      publishedAt: parseDate(release.published_at ?? release.created_at),
    }, this.now);
  }
}
