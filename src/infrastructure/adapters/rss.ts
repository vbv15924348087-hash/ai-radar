import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SourceAdapter } from "@/application/ports";
import type { RawItem } from "@/domain/content";
import type { Source } from "@/domain/source";
import type { PublicHttpClient } from "@/infrastructure/http/public-http";
import { draft, list, object, parseDate, plainText, safeItemUrl, scalar, stableId } from "./common";

export function parseFeed(xml: string, feedUrl: string): RawItem[] {
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("Feed document types and entity declarations are not allowed.");
  if (XMLValidator.validate(xml) !== true) throw new Error("Source returned malformed XML.");
  const document = object(new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(xml));
  const rss = object(object(document.rss).channel);
  const atom = object(document.feed);
  const rdf = object(document["rdf:RDF"]);
  if (!document.rss && !document.feed && !document["rdf:RDF"]) throw new Error("Source must return an RSS or Atom feed.");
  const entries = list(rss.item ?? atom.entry ?? rdf.item).slice(0, 50);
  const feedTitle = plainText(rss.title ?? atom.title ?? object(rdf.channel).title);
  const language = scalar(rss.language ?? atom["@_xml:lang"]);
  const items: RawItem[] = [];
  for (const input of entries) {
    const entry = object(input);
    const links = list(entry.link);
    const link = links.find((value) => {
      const rel = scalar(object(value)["@_rel"]);
      return !rel || rel === "alternate";
    });
    const guid = scalar(entry.guid ?? entry.id);
    const url = safeItemUrl(object(link)["@_href"] ?? link, feedUrl) ??
      (/^https?:\/\//i.test(guid) ? safeItemUrl(guid) : null);
    if (!url) continue;
    const externalId = guid || stableId(url, scalar(entry.title), scalar(entry.pubDate ?? entry.published ?? entry.updated));
    items.push({ externalId, url, payload: { format: document.feed ? "atom" : "rss", feedUrl, feedTitle, language, entry } });
  }
  return items;
}

export class FeedAdapter implements SourceAdapter {
  constructor(
    private readonly http: PublicHttpClient,
    private readonly location: (source: Source) => string = (source) => source.urlOrIdentifier,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async discover(source: Source): Promise<RawItem[]> {
    const response = await this.http(this.location(source), { headers: { accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" } });
    return parseFeed(response.body, response.url);
  }
  async fetch(raw: RawItem, _source: Source): Promise<RawItem> {
    // Feed entries are complete metadata snapshots; article pages are not fetched implicitly.
    return raw;
  }
  normalize(raw: RawItem, source: Source) {
    const payload = object(raw.payload);
    const entry = object(payload.entry);
    const authors = list(entry.author).map((value) => scalar(object(value).name) || scalar(value)).filter(Boolean);
    const text = entry["content:encoded"] ?? entry.content ?? entry.description ?? entry.summary ?? object(entry["media:group"])["media:description"] ?? entry.title;
    return draft(raw, source, {
      title: scalar(entry.title), author: authors.join(", ") || scalar(entry["dc:creator"]) || scalar(payload.feedTitle),
      text: scalar(text), publishedAt: parseDate(entry.pubDate ?? entry.published ?? entry.updated ?? entry["dc:date"]),
      language: scalar(payload.language),
    }, this.now);
  }
}
