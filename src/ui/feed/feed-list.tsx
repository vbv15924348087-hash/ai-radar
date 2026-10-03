"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Bookmark, Check } from "lucide-react";
import type { FeedItem } from "@/domain/intelligence";
import type { Topic } from "@/domain/topic";
import { MUST_READ_THRESHOLD } from "@/domain/ranking";
import { api, errorMessage, formatDate } from "@/ui/common/api";
import { ErrorNotice } from "@/ui/common/feedback";
import { SourceIcon } from "@/ui/common/source-icon";

export function FeedList({ items, topics, onSelect, onUpdated, selected, offset = 0 }: { items: FeedItem[]; topics: Topic[]; onSelect: (id: string) => void; onUpdated: () => void; selected: string | null; offset?: number }) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".feed-open"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    buttons[next]?.focus();
  }
  return <div className="feed-list" onKeyDown={navigate}>{items.map((item, index) => <FeedRow key={item.contentItemId} item={item}
    topicNames={item.topics.map(id => topics.find(topic => topic.id === id)?.name ?? "历史主题")}
    rank={index + offset + 1} selected={selected === item.contentItemId} onSelect={() => onSelect(item.contentItemId)} onUpdated={onUpdated} />)}</div>;
}

function FeedRow({ item, topicNames, rank, selected, onSelect, onUpdated }: { item: FeedItem; topicNames: string[]; rank: number; selected: boolean; onSelect: () => void; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggleFavorite() {
    setBusy(true); setError("");
    try { await api(`/api/items/${item.contentItemId}`, { method: "PATCH", body: JSON.stringify({ favorite: !item.favorite }) }); onUpdated(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  const development = item.provider.toLowerCase().includes("development");
  const preview = development ? item.evidence[0]?.quote || item.content.normalizedContent || item.summary : item.summary;
  return <article className={`feed-row ${item.read ? "is-read" : ""} ${selected ? "is-selected" : ""}`}>
    <span className="feed-rank" aria-hidden="true">{String(rank).padStart(2, "0")}</span>
    <button className="feed-open" data-item-id={item.contentItemId} aria-label={`阅读：${item.content.title}`} aria-pressed={selected} onClick={onSelect}>
      <span className="feed-meta"><SourceIcon type={item.content.sourceType} /><span className="source-name">{item.sourceName}</span><span className="meta-dot">·</span>
        <time dateTime={item.content.publishedAt ?? undefined} title={formatDate(item.content.publishedAt, true)}>{formatDate(item.content.publishedAt)}</time>
        {topicNames.length > 0 && <><span className="meta-dot">·</span><span className="feed-topic" title={topicNames.join(" · ")}>{topicNames[0]}{topicNames.length > 1 ? ` +${topicNames.length - 1}` : ""}</span></>}
        {item.read && <span className="read-label"><Check size={11} />已读</span>}
      </span>
      <span className="feed-title">{item.content.title}</span>
      <span className="feed-summary">{development && <span className="excerpt-label">摘录</span>}{preview}</span>
    </button>
    <div className="feed-right">
      <span className={`signal-score ${item.finalScore >= MUST_READ_THRESHOLD ? "high" : ""}`} title={`推荐分 ${item.finalScore} / 100${item.finalScore >= MUST_READ_THRESHOLD ? " · 强烈推荐" : ""}`} aria-label={`推荐分 ${item.finalScore}`}>{item.finalScore >= MUST_READ_THRESHOLD && <span className="signal-dot" />}{item.finalScore}</span>
      <div className="feed-row-actions"><button className={`icon-button bookmark-button ${item.favorite ? "is-favorite" : ""}`} disabled={busy} onClick={() => void toggleFavorite()} aria-label={`${item.favorite ? "取消收藏" : "收藏"}：${item.content.title}`} aria-pressed={item.favorite}><Bookmark size={15} fill={item.favorite ? "currentColor" : "none"} /></button>
        <a href={item.content.url} target="_blank" rel="noopener noreferrer" className="icon-button original-link" aria-label={`打开原文：${item.content.title}`} title="打开原文"><ArrowUpRight size={15} /></a></div>
    </div>
    {error && <div className="feed-row-error"><ErrorNotice message={error} retry={() => void toggleFavorite()} /></div>}
  </article>;
}

