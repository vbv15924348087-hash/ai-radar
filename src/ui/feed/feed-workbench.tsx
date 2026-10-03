"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Topic } from "@/domain/topic";
import type { SyncRun } from "@/domain/sync";
import { api, errorMessage, formatDate, useResource } from "@/ui/common/api";
import { EmptyFeed, ErrorNotice, FeedSkeleton, ProviderNotice } from "@/ui/common/feedback";
import { FeedFilters } from "./feed-filters";
import { FeedList } from "./feed-list";
import { FeedMetrics } from "./feed-metrics";
import { initialFilters, type FeedResponse } from "./feed-types";
import { IntelligenceDetail } from "./intelligence-detail";

const LIBRARY_PAGE_SIZE = 20;

export function FeedWorkbench({ view, initialTopic = "", savedView = false }: { view: "today" | "library"; initialTopic?: string; savedView?: boolean }) {
  const today = view === "today";
  const [filters, setFilters] = useState({ ...initialFilters, topic: initialTopic, favorite: savedView });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [readerRevision, setReaderRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncResult, setSyncResult] = useState("");
  const listArea = useRef<HTMLDivElement>(null);
  const topics = useResource<{ topics: Topic[] }>("/api/topics");
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(filters.search); setOffset(0); }, 300); return () => window.clearTimeout(timer); }, [filters.search]);
  const query = new URLSearchParams({ view, limit: String(today ? 10 : LIBRARY_PAGE_SIZE), offset: String(offset) });
  for (const [key, value] of Object.entries({ ...filters, search: debouncedSearch })) if (value) query.set(key, String(value));
  const feed = useResource<FeedResponse>(`/api/feed?${query.toString()}`);
  const items = feed.data?.items;
  const searchPending = filters.search !== debouncedSearch;
  useEffect(() => {
    if (!today && !feed.loading && !feed.error && feed.data && offset > 0 && offset >= feed.data.total) {
      setOffset(Math.max(0, Math.ceil(feed.data.total / LIBRARY_PAGE_SIZE) - 1) * LIBRARY_PAGE_SIZE);
    }
  }, [today, feed.loading, feed.error, feed.data, offset]);
  useEffect(() => {
    const row = Array.from(listArea.current?.querySelectorAll<HTMLButtonElement>(".feed-open") ?? []).find(button => button.dataset.itemId === selected);
    row?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const closeReader = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => {
      const buttons = listArea.current?.querySelectorAll<HTMLButtonElement>(".feed-open");
      const target = Array.from(buttons ?? []).find(button => button.dataset.itemId === selected);
      (target ?? buttons?.[0] ?? listArea.current)?.focus();
    });
  }, [selected]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && selected) { event.preventDefault(); closeReader(); return; }
      const typing = event.target instanceof HTMLElement && (event.target.matches("input, textarea, select, summary") || event.target.isContentEditable);
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (["j", "k"].includes(event.key.toLowerCase()) && items?.length && !feed.loading) {
        event.preventDefault();
        const current = items.findIndex(item => item.contentItemId === selected);
        const next = current < 0 ? 0 : Math.max(0, Math.min(items.length - 1, current + (event.key.toLowerCase() === "j" ? 1 : -1)));
        setSelected(items[next].contentItemId);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, items, closeReader, feed.loading]);

  async function sync() {
    setSyncing(true); setSyncError(""); setSyncResult("");
    try {
      const result = await api<{ runs: SyncRun[] }>("/api/sync", { method: "POST", body: "{}" });
      if (!result.runs.length) setSyncResult("尚无已启用的信息源。请先添加来源。");
      else {
        const failed = result.runs.filter(run => run.state === "failed" || run.failed > 0).length;
        setSyncResult(`同步完成 · ${result.runs.length} 个信息源 · 新分析 ${result.runs.reduce((sum, run) => sum + run.analyzed, 0)} 条${failed ? ` · ${failed} 个来源存在失败，请查看详情` : ""}`);
      }
      await feed.reload();
    } catch (cause) { setSyncError(errorMessage(cause)); } finally { setSyncing(false); }
  }
  const data = feed.data;
  const selectedIndex = items?.findIndex(item => item.contentItemId === selected) ?? -1;
  const filtered = Object.entries(filters).some(([key, value]) => Boolean(value) && !(savedView && key === "favorite"));
  return <div className="page feed-page">
    <header className="page-heading">
      <div><div className="feed-heading-line"><h1>{today ? "今日情报" : savedView ? "已收藏" : "全部情报"}</h1><span className="view-caption">{today ? "Today" : savedView ? "Saved" : "Library"}</span></div>
        <p className="feed-status">{data ? `${data.total} 条情报` : "正在读取情报"}<span>·</span>{data?.lastRun ? `最近同步 ${formatDate(data.lastRun.finishedAt ?? data.lastRun.startedAt, true)}` : "尚未同步"}</p></div>
      <button className="button sync-button" disabled={syncing} onClick={() => void sync()}><RefreshCw size={14} className={syncing ? "spin" : ""} />{syncing ? "同步与分析中…" : "同步来源"}</button>
    </header>
    <ProviderNotice provider={data?.provider} />
    {syncError && <ErrorNotice message={syncError} retry={() => void sync()} />}
    {syncResult && <div className="notice sync-result" role="status"><span>{syncResult}</span><Link href="/sources">查看信息源 <ArrowUpRight size={13} /></Link></div>}
    {topics.error && <ErrorNotice message={`研究主题加载失败：${topics.error}`} retry={() => void topics.reload()} />}
    <FeedFilters value={filters} topics={topics.data?.topics ?? []} savedView={savedView} onChange={next => { setOffset(0); setFilters(next); listArea.current?.scrollTo({ top: 0 }); }} />
    <div className={`reading-workspace ${selected ? "reader-open" : ""}`}>
      <section className="feed-section" aria-label={today ? "今日精选情报" : savedView ? "收藏的情报" : "历史情报"} aria-busy={feed.loading}>
        <div className="section-heading"><div><h2>{today ? "今日精选" : savedView ? "收藏列表" : "信息流"}</h2><span className="count-label">{data ? `${today ? Math.min(data.total, 10) : data.total} 条` : "—"}</span>{feed.loading && data && <span className="refresh-label" role="status">更新中…</span>}</div>
          <span className="sort-label" title="按推荐分降序，同分按发布时间排序"><ArrowDownWideNarrow size={13} />推荐分排序</span></div>
        <div className="feed-scroll" ref={listArea} tabIndex={-1}>
          {feed.error ? <ErrorNotice message={feed.error} retry={() => void feed.reload()} /> : !data && feed.loading ? <FeedSkeleton /> : data?.items.length ?
            <FeedList items={data.items} topics={topics.data?.topics ?? []} offset={offset} selected={selected} onSelect={setSelected} onUpdated={() => { setReaderRevision(previous => previous + 1); void feed.reload(); }} /> :
            <EmptyFeed filtered={filtered} today={today} reset={filtered ? () => { setOffset(0); setFilters({ ...initialFilters, favorite: savedView }); } : undefined} savedView={savedView} />}
        </div>
        <footer className="feed-footer">
          {!today && data && data.total > LIBRARY_PAGE_SIZE ? <div className="pagination"><span>{offset + 1}–{Math.min(offset + LIBRARY_PAGE_SIZE, data.total)} / {data.total}</span><div>
            <button className="icon-button" aria-label="上一页" disabled={offset === 0 || feed.loading || searchPending} onClick={() => { setOffset(Math.max(0, offset - LIBRARY_PAGE_SIZE)); listArea.current?.scrollTo({ top: 0 }); }}><ChevronLeft size={16} /></button>
            <button className="icon-button" aria-label="下一页" disabled={offset + LIBRARY_PAGE_SIZE >= data.total || feed.loading || searchPending} onClick={() => { setOffset(offset + LIBRARY_PAGE_SIZE); listArea.current?.scrollTo({ top: 0 }); }}><ChevronRight size={16} /></button></div></div> :
            <div className="feed-footnote"><span>{today ? "按今日处理时间收录 · 最多精选 10 条" : "已显示当前筛选下的全部情报"}</span>{today && <Link href="/library">查看全部 <ArrowUpRight size={12} /></Link>}</div>}
          {today && <FeedMetrics metrics={data?.metrics} />}
        </footer>
      </section>
      {selected && <IntelligenceDetail key={selected} id={selected} revision={readerRevision} topics={topics.data?.topics ?? []} onClose={closeReader} onUpdated={() => void feed.reload()}
        onPrevious={selectedIndex > 0 ? () => setSelected(items![selectedIndex - 1].contentItemId) : undefined}
        onNext={selectedIndex >= 0 && selectedIndex < (items?.length ?? 0) - 1 ? () => setSelected(items![selectedIndex + 1].contentItemId) : undefined}
        position={selectedIndex >= 0 ? `${selectedIndex + 1} / ${items?.length}` : undefined} />}
    </div>
    <div className="workspace-hint"><span><kbd>J</kbd> <kbd>K</kbd> 切换情报 <span className="hint-divider">·</span> <kbd>Enter</kbd> 打开 <span className="hint-divider">·</span> <kbd>Esc</kbd> 关闭</span><span>跟进变化，保留判断。</span></div>
  </div>;
}

