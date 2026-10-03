import { createHash, randomUUID } from "node:crypto";
import type { ContentDraft, ContentItem } from "@/domain/content";
import type { RadarRepository } from "@/application/repository";
import type { SemanticDeduplicator } from "@/application/ports";

const TRACKING_PARAMETERS = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;
export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("内容链接必须为 HTTP(S) 公共链接");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
export function contentFingerprint(draft: Pick<ContentDraft, "title" | "normalizedContent">): string {
  const text = draft.normalizedContent.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  // Short descriptions such as "Read more" must not merge unrelated articles.
  const identity = text.length >= 100 ? text : `${draft.title.normalize("NFKC").toLocaleLowerCase().trim()}\n${text}`;
  return createHash("sha256").update(identity).digest("hex");
}
export async function deduplicateContent(repository: RadarRepository, draft: ContentDraft, semantic?: SemanticDeduplicator) {
  if (!draft.title.trim() || !draft.externalId || !draft.normalizedContent.trim()) throw new Error("来源内容缺少标题、标识或正文");
  const canonicalUrl = canonicalizeUrl(draft.url);
  const fingerprint = contentFingerprint(draft);
  let existing = await repository.findDuplicate(draft, canonicalUrl, fingerprint);
  if (!existing && semantic) {
    const id = await semantic.findSimilar(draft);
    if (id) existing = await repository.getContent(id);
  }
  if (existing) {
    await repository.observe(existing.id, draft);
    return { content: existing, duplicate: true };
  }
  const content: ContentItem = { ...draft, id: randomUUID(), canonicalUrl, fingerprint,
    state: "pending", attempts: 0, error: null, eventId: null };
  await repository.insertContent(content);
  await repository.observe(content.id, draft);
  return { content, duplicate: false };
}
