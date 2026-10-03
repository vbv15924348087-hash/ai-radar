"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Newspaper, RefreshCw, Save } from "lucide-react";
import type { DailyDigest, DigestIndexItem, DigestSelection } from "@/domain/digest";
import { api, errorMessage, useResource } from "@/ui/common/api";
import { ErrorNotice, LoadingState } from "@/ui/common/feedback";

const freshnessLabels = { "24h": "24 小时内", "72h": "近 72 小时", "7d": "本周补充" };
type SelectionDraft = { selectedIds: string[]; angle: string; saved: boolean };
function beijingTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function DigestWorkbench() {
  const index = useResource<{ digests: DigestIndexItem[] }>("/api/digests");
  const [chosenDate, setChosenDate] = useState("");
  const [drafts, setDrafts] = useState<Record<string, SelectionDraft>>({});
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const date = chosenDate || index.data?.digests[0]?.date || "";
  useEffect(() => { if (!chosenDate && index.data?.digests[0]) setChosenDate(index.data.digests[0].date); }, [chosenDate, index.data]);
  return <div className="page digest-page">
    <header className="page-heading digest-page-heading">
      <div><div className="digest-eyebrow"><Newspaper size={14} /> INTELLIGENCE / DAILY ISSUE</div><h1>每日精选<span className="digest-heading-period">.</span></h1><p>先读一手消息，再选值得写的题。</p></div>
      <div className="heading-actions"><span className="digest-schedule">每天 20:00 更新 · 北京时间</span>
        <label className="select-field"><span className="sr-only">选择简报日期</span><select value={date} onChange={event => setChosenDate(event.target.value)} disabled={saving || !index.data?.digests.length}>{!date && <option value="">暂无简报</option>}{index.data?.digests.map(item => <option key={item.date} value={item.date}>{item.date} · {item.count} 条</option>)}</select></label>
        <button className="icon-button" aria-label="刷新每日精选" disabled={index.loading || saving} onClick={() => { void index.reload(); setRevision(value => value + 1); }}><RefreshCw size={15} /></button>
      </div>
    </header>
    {index.error && <ErrorNotice message={index.error} retry={() => void index.reload()} />}
    {index.loading && !index.data && <LoadingState label="正在读取每日精选…" />}
    {!index.loading && !index.error && !date && <div className="digest-empty"><Newspaper size={28} /><h2>第一期精选正在准备</h2><p>简报会附上原始来源、发布日期和选题角度，生成后可在这里浏览。</p></div>}
    {date && <DigestEdition key={date} date={date} revision={revision} initialDraft={drafts[date]} onBusyChange={setSaving} onDraftChange={draft => setDrafts(previous => ({ ...previous, [date]: draft }))} />}
  </div>;
}

function DigestEdition({ date, revision, initialDraft, onDraftChange, onBusyChange }: { date: string; revision: number; initialDraft?: SelectionDraft; onDraftChange: (draft: SelectionDraft) => void; onBusyChange: (value: boolean) => void }) {
  const resource = useResource<{ digest: DailyDigest; selection: DigestSelection; storage?: "cloud" | "local" }>(`/api/digests/${date}`);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialDraft?.selectedIds ?? []);
  const [angle, setAngle] = useState(initialDraft?.angle ?? "");
  const [initialized, setInitialized] = useState(!!initialDraft);
  const [saved, setSaved] = useState(initialDraft?.saved ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current !== revision) { previousRevision.current = revision; void resource.reload(); }
  }, [revision, resource.reload]);
  useEffect(() => {
    if (resource.data && !initialized) {
      setSelectedIds(resource.data.selection.selectedIds);
      setAngle(resource.data.selection.angle);
      setSaved(resource.data.selection.updatedAt !== null);
      setInitialized(true);
    }
  }, [resource.data, initialized]);
  const digest = resource.data?.digest;
  if (resource.error) return <ErrorNotice message={resource.error} retry={() => void resource.reload()} />;
  if (!digest || !initialized) return <LoadingState label="正在加载简报与已保存的选题…" />;
  const selected = digest.items.filter(item => selectedIds.includes(item.id));
  const missing = selectedIds.filter(id => !digest.items.some(item => item.id === id));
  const freshCount = digest.items.filter(item => item.freshness === "24h").length;
  const recommendedCount = digest.items.filter(item => item.recommended).length;
  const selectionLocation = resource.data?.storage === "cloud"
    ? `请先从已登录的 AI Radar 云端工作区读取 /api/digests/${date} 返回的简报和 selection（${typeof window !== "undefined" ? window.location.origin : ""}）。`
    : `请先读取 woshipm-daily/selections/${date}.json 和对应日期的简报。`;
  const request = `请根据我在 AI Radar 保存的 ${date} 选题 ${selected.map(item => item.id).join("、")}，核对最新原文后总结成一篇有原创分析的 AI 产品实战文章。${angle.trim() ? `写作方向：${angle.trim()}。` : ""}${selectionLocation}`;
  function toggle(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id];
    setSelectedIds(next); onDraftChange({ selectedIds: next, angle, saved: false });
    setSaved(false); setCopied(false); setShowRequest(false);
  }
  async function save() {
    setBusy(true); onBusyChange(true); setError("");
    try {
      await api(`/api/digests/${date}/selection`, { method: "PUT", body: JSON.stringify({ selectedIds, angle }) });
      setSaved(true);
      onDraftChange({ selectedIds, angle, saved: true });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function copyRequest() {
    setShowRequest(true);
    try { await navigator.clipboard.writeText(request); setCopied(true); }
    catch { setCopied(false); }
  }
  return <>
    <section className="digest-intro" aria-label="本期概览">
      <div className="digest-edition"><span>ISSUE / {digest.date.slice(0, 4)}</span><strong>{digest.date.replaceAll("-", ".")}</strong><span>原文核验 · 供你选题</span></div>
      <h2>{digest.title}</h2><p>{digest.intro}</p>
      <div className="digest-window">整理于 {beijingTime(digest.generatedAt)}（北京时间）<span>优先窗口 {beijingTime(digest.windowStart)} 起</span></div>
      <div className="digest-metrics" aria-label="本期材料统计"><div><strong>{String(digest.items.length).padStart(2, "0")}</strong><span>全部材料 / TOTAL</span></div><div><strong>{String(freshCount).padStart(2, "0")}</strong><span>24 小时 / FRESH</span></div><div><strong>{String(recommendedCount).padStart(2, "0")}</strong><span>推荐角度 / EDITOR'S PICK</span></div></div>
    </section>
    <div className="digest-layout">
      <section aria-label="精选资讯列表" className="digest-feed">
        <div className="section-heading"><h2>阅读与选题</h2><span className="count-label">{digest.items.length} 条核验材料 · 推荐项供你参考</span></div>
        {digest.items.map((item, index) => <article key={item.id} className={`digest-card ${selectedIds.includes(item.id) ? "digest-card-selected" : ""}`}>
          <div className="digest-card-top"><span className="digest-number">{String(index + 1).padStart(2, "0")}</span><span className={`digest-freshness freshness-${item.freshness}`}>{freshnessLabels[item.freshness]}</span><span className="digest-category">{item.category}</span>{item.recommended && <span className="digest-recommended">编辑推荐</span>}{selectedIds.includes(item.id) && <span className="digest-selected-label">已选入</span>}</div>
          <h3><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={16} /></a></h3>
          <div className="digest-source">{item.source}<span>·</span><time dateTime={item.publishedAt}>原文 {item.publishedAt}</time><span>·</span><span>{item.id}</span></div>
          <p className="digest-summary">{item.summary}</p>
          <div className="digest-impact"><span>产品经理视角</span><p>{item.whyItMatters}</p></div>
          <div className="digest-angle"><span>可写角度</span><p>{item.angle}</p></div>
          <details className="digest-evidence"><summary>核验依据与适用边界</summary><p>{item.caveat}</p>{item.evidence.map((evidence, position) => <blockquote key={position}><p>{evidence.quote}</p><a href={evidence.url} target="_blank" rel="noopener noreferrer">查看原始依据 <ArrowUpRight size={12} /></a></blockquote>)}</details>
          <footer className="digest-card-footer"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">阅读原文 <ArrowUpRight size={13} /></a><label className="digest-select"><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={busy} onChange={() => toggle(item.id)} aria-label={`选题 ${item.id} ${item.title}`} /><span>{selectedIds.includes(item.id) ? "已加入选题" : "加入我的选题"}</span></label></footer>
        </article>)}
        <section className="digest-coverage"><h3>本期检索说明</h3><ul>{digest.coverageNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>
      </section>
      <aside className="digest-shortlist" aria-label="我的选题">
        <div className="digest-shortlist-title"><h2>我的选题</h2><span>{selected.length}</span></div><p className="digest-shortlist-help">读完后勾选材料，可以围绕一个问题组合多条消息。</p>
        {selected.length ? <ul className="digest-picked">{selected.map(item => <li key={item.id}><span>{item.id}</span><p>{item.title}</p><button aria-label={`移除选题 ${item.id}`} disabled={busy} onClick={() => toggle(item.id)}>移除</button></li>)}</ul> : <p className="digest-no-selection">还没有选择材料。左侧的推荐角度可以作为起点。</p>}
        {missing.length > 0 && <div className="notice error-notice"><span>本期材料已更新，原选题 {missing.join("、")} 已不在简报中。</span><button className="text-button" disabled={busy} onClick={() => { const next = selected.map(item => item.id); setSelectedIds(next); setSaved(false); onDraftChange({ selectedIds: next, angle, saved: false }); }}>移除失效项</button></div>}
        <label className="digest-angle-input">想写的方向<span>可选</span><textarea maxLength={2000} rows={4} value={angle} disabled={busy} placeholder="例如：从用户体验出发，比较本地 Agent 与云端 Agent 的落地成本。" onChange={event => { setAngle(event.target.value); setSaved(false); setCopied(false); setShowRequest(false); onDraftChange({ selectedIds, angle: event.target.value, saved: false }); }} /></label>
        {error && <ErrorNotice message={error} />}
        <button className="button primary digest-save" disabled={busy || missing.length > 0} onClick={() => void save()}>{saved ? <Check size={15} /> : <Save size={15} />}{busy ? "保存中…" : saved ? "选题已保存" : "保存选题"}</button>
        <div className="digest-save-status" role="status">{saved ? "已保存到工作台，下次打开可以继续。" : "选择后记得保存。"}</div>
        <button className="button digest-copy" disabled={!saved || !selected.length || busy || missing.length > 0} onClick={() => void copyRequest()}><Copy size={14} />{copied ? "已复制，粘贴到任务即可" : "复制写作请求"}</button>
        {showRequest && <textarea className="digest-request" aria-label="写作请求" rows={7} readOnly value={request} onFocus={event => event.target.select()} />}
        <p className="digest-next-step">保存后回到 Codex，告诉我“按已保存的选题整理”，我会结合原文写作；需要投稿时再告诉我发文。</p>
      </aside>
    </div>
  </>;
}
