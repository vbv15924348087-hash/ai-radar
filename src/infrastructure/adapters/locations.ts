import type { SourceType } from "@/domain/source";
import { validatePublicUrl } from "@/infrastructure/http/public-http";

export function githubRepository(identifier: string): string {
  let repository = identifier.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(repository)) {
    const url = validatePublicUrl(repository);
    if (url.hostname !== "github.com") throw new Error("GitHub source must use github.com or owner/repository.");
    repository = url.pathname.replace(/^\//, "").replace(/\/(releases|releases\/.*)$/, "").replace(/\/$/, "");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || repository.split("/")[1] === "." || repository.split("/")[1] === "..") {
    throw new Error("GitHub source must identify one owner/repository.");
  }
  return repository;
}
export function youtubeChannel(identifier: string): string {
  let channel = identifier.trim();
  if (/^https?:\/\//i.test(channel)) {
    const url = validatePublicUrl(channel);
    if (!["youtube.com", "www.youtube.com"].includes(url.hostname)) throw new Error("YouTube source must be a YouTube channel URL or UC channel ID.");
    channel = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/)?.[1] ?? "";
  }
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channel)) throw new Error("YouTube requires a UC channel ID (24 characters) or /channel/ URL; handles are not supported.");
  return channel;
}
export function xUsername(identifier: string): string {
  let username = identifier.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(username)) {
    const url = validatePublicUrl(username);
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) throw new Error("X source must be an X profile URL or username.");
    username = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) throw new Error("X source must identify one valid username.");
  return username;
}
export function paperFeed(identifier: string): string {
  if (/^https?:\/\//i.test(identifier)) return validatePublicUrl(identifier).href;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(identifier)) throw new Error("Paper feed URLs must use HTTP or HTTPS.");
  const query = identifier.trim();
  if (!query || query.length > 1000) throw new Error("Paper source requires an arXiv search query or an RSS/Atom URL.");
  const url = new URL("https://export.arxiv.org/api/query");
  url.search = new URLSearchParams({ search_query: query, start: "0", max_results: "30", sortBy: "submittedDate", sortOrder: "descending" }).toString();
  return url.href;
}
export function validateSourceLocation(type: SourceType, identifier: string): void {
  const validators: Record<SourceType, (value: string) => unknown> = {
    RSS: validatePublicUrl, Blog: validatePublicUrl, Paper: paperFeed,
    GitHub: githubRepository, YouTube: youtubeChannel, X: xUsername,
  };
  validators[type](identifier);
}
