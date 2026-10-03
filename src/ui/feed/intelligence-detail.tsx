"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, ChevronDown, ChevronUp, Download, X } from "lucide-react";
import type { FeedItem } from "@/domain/intelligence";
import type { Observation } from "@/domain/content";
import type { Topic } from "@/domain/topic";
import { api, errorMessage, formatDate, useResource } from "@/ui/common/api";
import { ErrorNotice, LoadingState } from "@/ui/common/feedback";
import { SourceIcon } from "@/ui/common/source-icon";

interface ReaderProps {
  id: string; topics: Topic[]; onClose: () => void; onUpdated: () => void;
  onPrevious?: () => void; onNext?: () => void; position?: string; revision: number;
}

export function IntelligenceDetail({ id, topics, onClose, onUpdated, onPrevious, onNext, position, revision }: ReaderProps) {
  const resource = useResource<{ item: FeedItem; observations: Observation[] }>(`/api/items/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current !== revision) { previousRevision.current = revision; void resource.reload(); }
  }, [revision, resource.reload]);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  async function update(patch: { favorite?: boolean; read?: boolean }) {
    setBusy(true); setError("");
    try {
      await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      resource.setData(previous => previous ? { ...previous, item: { ...previous.item, ...patch } } : previous);
      onUpdated();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  const item = resource.data?.item.contentItemId === id ? resource.data.item : undefined;
  const development = item?.provider.toLowerCase().includes("development");
  const AnalysisContainer = development ? "details" : "div";
  const rawText = item?.content.normalizedContent || item?.content.rawContent || "";
  const readingMinutes = Math.max(1, Math.ceil(rawText.replace(/[\u3400-\u9fff]/g, " ").split(/\s+/).filter(Boolean).length / 220 + (rawText.match(/[\u3400-\u9fff]/g)?.length ?? 0) / 400));
  return <aside ref={panel} id="reader-panel" className="reader-panel" aria-label="情报阅读面板" aria-busy={resource.loading} tabIndex={-1}>
    <header className="reader-toolbar"><span>阅读简报</span><div className="reader-navigation"><span>{position}</span><button className="icon-button" onClick={onPrevious} disabled={!onPrevious} aria-label="上一篇情报" title="上一篇 · K"><ChevronUp size={16} /></button><button className="icon-button" onClick={onNext} disabled={!onNext} aria-label="下一篇情报" title="下一篇 · J"><ChevronDown size={16} /></button><span className="toolbar-divider" /><button className="icon-button" onClick={onClose} aria-label="关闭阅读面板" title="关闭 · Esc"><X size={17} /></button></div></header>
    <div className="reader-scroll">
      {resource.error && <ErrorNotice message={resource.error} retry={() => void resource.reload()} />}
      {!item && resource.loading && <LoadingState label="正在加载情报与证据…" />}
      {item && <article className="reader-article">
        <div className="detail-meta"><SourceIcon type={item.content.sourceType} /><span>{item.sourceName}</span><span>·</span><span>{item.content.sourceType}</span></div>
        <h2 className="detail-title">{item.content.title}</h2>
        <div className="detail-byline"><span>{item.content.author || "作者未提供"}</span><span>·</span><time dateTime={item.content.publishedAt ?? undefined}>{formatDate(item.content.publishedAt, true)}</time><span>·</span><span title="依据已采集原文长度估算">约 {readingMinutes} 分钟</span></div>
        <div className="detail-actions">
          <button className={`button ${item.favorite ? "selected" : ""}`} disabled={busy || resource.loading} aria-pressed={item.favorite} onClick={() => void update({ favorite: !item.favorite })}><Bookmark size={14} fill={item.favorite ? "currentColor" : "none"} />{item.favorite ? "已收藏" : "收藏"}</button>
          <button className="button" disabled={busy || resource.loading} onClick={() => void update({ read: !item.read })}><Check size={14} />{item.read ? "标为未读" : "标为已读"}</button>
          <a className="icon-button" href={`/api/items/${id}/export`} download aria-label="下载 Markdown" title="导出 Markdown"><Download size={15} /></a>
          <a className="reader-original" href={item.content.url} target="_blank" rel="noopener noreferrer">打开原文 <ArrowUpRight size={14} /></a>
        </div>
        {error && <ErrorNotice message={error} />}
        <section className="detail-section detail-tldr"><div className="briefing-heading"><h3>{development ? "原文摘录" : "AI 摘要"}</h3><span>{development ? "规则分析 · 未启用 AI 总结" : "30 秒了解重点"}</span></div><p>{development ? item.evidence[0]?.quote || rawText.slice(0, 800) || item.summary : item.summary}</p></section>
        <AnalysisContainer className={development ? "reader-disclosure" : undefined}>
        {development && <><summary>规则分析说明</summary><section className="detail-section"><h3>分析摘要</h3><p>{item.summary}</p></section></>}
        <section className="detail-section"><h3>为什么值得关注</h3><p>{item.whyItMatters}</p></section>
        <section className="detail-section"><h3>关键变化</h3><ul>{item.keyChanges.map((change, index) => <li key={index}>{change}</li>)}</ul></section>
        <section className="detail-section"><h3>产品启发</h3><p>{item.productImpact}</p></section>
        </AnalysisContainer>
        <section className="detail-section"><h3>原文与证据</h3>{item.evidence.map((evidence, index) => <blockquote className="evidence" key={index}><p>{evidence.quote}</p><a href={evidence.url} target="_blank" rel="noopener noreferrer">核对来源 <ArrowUpRight size={12} /></a></blockquote>)}
          <details className="reader-disclosure"><summary>查看已采集原文</summary><pre className="original-text">{rawText || "未提供原文文本。"}</pre></details>
        </section>
        <details className="reader-disclosure"><summary>相关主题与评分<span>推荐分 {item.finalScore} / 100</span></summary>
          <div className="reader-topics">{item.topics.length ? item.topics.map(topicId => <a href={`/library?topic=${encodeURIComponent(topicId)}`} key={topicId}>{topics.find(topic => topic.id === topicId)?.name ?? "历史主题"}</a>) : <p>尚未匹配研究主题。</p>}</div>
          <div className="score-breakdown">{[{ label: "相关性", score: item.relevanceScore }, { label: "重要性", score: item.importanceScore }, { label: "新颖度", score: item.noveltyScore }, { label: "来源质量", score: item.sourceQualityScore }].map(dimension => <div key={dimension.label}><span>{dimension.label}</span><b>{dimension.score}</b><meter aria-label={dimension.label} min={0} max={100} value={dimension.score}>{dimension.score}</meter></div>)}</div>
        </details>
        <details className="reader-disclosure observations"><summary>采集记录<span>{resource.data?.observations.length ?? 0} 条记录</span></summary>{resource.data?.observations.map(observation => <div className="observation" key={observation.id}><a href={observation.url} target="_blank" rel="noopener noreferrer">{observation.url}</a><time>{formatDate(observation.observedAt, true)}</time><details><summary>查看原始文本</summary><pre>{observation.rawContent}</pre></details></div>)}</details>
        <footer className="detail-footer">分析服务 {item.provider}<br />处理版本 {item.processingVersion} · {formatDate(item.createdAt, true)}</footer>
      </article>}
    </div>
  </aside>;
}

