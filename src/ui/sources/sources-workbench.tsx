"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Source, SourceInput } from "@/domain/source";
import type { SyncRun } from "@/domain/sync";
import { api, errorMessage, useResource, type ProviderStatus } from "@/ui/common/api";
import { Dialog } from "@/ui/common/dialog";
import { ErrorNotice, LoadingState, ProviderNotice } from "@/ui/common/feedback";
import { SourceForm } from "./source-form";
import { SourceTable } from "./source-table";
import { SyncHistory } from "./sync-history";

const presets: SourceInput[] = [
  { name: "OpenAI Blog", type: "Blog", urlOrIdentifier: "https://openai.com/news/rss.xml", enabled: true, priority: 5, metadata: {} },
  { name: "openai/codex", type: "GitHub", urlOrIdentifier: "openai/codex", enabled: true, priority: 4, metadata: {} },
  { name: "arXiv cs.AI", type: "Paper", urlOrIdentifier: "cat:cs.AI", enabled: true, priority: 3, metadata: {} },
];

export function SourcesWorkbench() {
  const sources = useResource<{ sources: Source[]; provider: ProviderStatus }>("/api/sources");
  const history = useResource<{ runs: SyncRun[] }>("/api/sync");
  const [editing, setEditing] = useState<Source | "new" | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function execute(label: string, action: () => Promise<void>) {
    setBusy(label); setError(""); setMessage("");
    try { await action(); await Promise.all([sources.reload(), history.reload()]); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(""); }
  }
  function sync(sourceId?: string, retry = false) {
    void execute("sync", async () => {
      const { runs } = await api<{ runs: SyncRun[] }>("/api/sync", { method: "POST", body: JSON.stringify({ sourceId, retry }) });
      const failed = runs.filter(run => run.state === "failed" || run.failed > 0).length;
      setMessage(!runs.length ? "尚无已启用的信息源。" : `同步结束 · ${runs.length} 个来源 · 新分析 ${runs.reduce((sum, run) => sum + run.analyzed, 0)} 条${failed ? ` · ${failed} 个来源存在失败，详见同步记录` : ""}`);
    });
  }
  const allSources = sources.data?.sources ?? [];
  return <div className="page sources-page">
    <header className="page-heading">
      <div><h1>信息源</h1><p>{sources.data ? `${allSources.length} 个来源 · ${allSources.filter(source => source.enabled).length} 个已启用` : "正在读取订阅"}</p></div>
      <div className="heading-actions">
        <button className="button" disabled={Boolean(busy) || !allSources.some(source => source.enabled)} onClick={() => sync()}><RefreshCw size={15} className={busy === "sync" ? "spin" : ""} />{busy === "sync" ? "同步中…" : "全部同步"}</button>
        <button className="button primary" onClick={() => setEditing("new")} disabled={Boolean(busy)}><Plus size={16} />添加来源</button>
      </div>
    </header>
    <ProviderNotice provider={sources.data?.provider} />
    {error && <ErrorNotice message={error} />}{message && <div className="notice sync-result" role="status"><Check size={16} /><span>{message}</span><Link href="/">查看情报 <ArrowUpRight size={13} /></Link></div>}
    <section className="source-presets" aria-label="快速添加信息源"><span className="preset-label">快速添加</span><div>{presets.map(preset => {
      const exists = allSources.some(source => source.urlOrIdentifier === preset.urlOrIdentifier);
      return <button className="preset-button" key={preset.name} title={exists ? `已添加 ${preset.name}` : `添加 ${preset.name} · ${preset.type}`} disabled={Boolean(busy) || exists} onClick={() => void execute("preset", async () => { await api("/api/sources", { method: "POST", body: JSON.stringify(preset) }); setMessage(`已添加 ${preset.name}，可以开始同步。`); })}>{exists ? <Check size={13} /> : <Plus size={13} />}<span>{preset.name}</span></button>;
    })}</div></section>
    <section className="sources-section" aria-label="订阅列表" aria-busy={sources.loading}>
      {sources.error ? <ErrorNotice message={sources.error} retry={() => void sources.reload()} /> : sources.loading && !sources.data ? <LoadingState /> : allSources.length ? <SourceTable sources={allSources} busy={Boolean(busy)} onEdit={setEditing} onDelete={setDeleting} onSync={source => sync(source.id)} onToggle={source => void execute("toggle", async () => { await api(`/api/sources/${source.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !source.enabled }) }); })} /> : <div className="empty-state source-empty"><h2>尚未添加信息源</h2><p>添加 RSS、GitHub、博客、论文、YouTube 或 X，随后同步内容。</p><button className="button primary" onClick={() => setEditing("new")}><Plus size={15} />添加来源</button></div>}
    </section>
    {history.error ? <ErrorNotice message={history.error} retry={() => void history.reload()} /> : history.loading && !history.data ? <LoadingState label="正在读取同步记录…" /> : <SyncHistory runs={history.data?.runs ?? []} sources={allSources} busy={Boolean(busy)} onRetry={sourceId => sync(sourceId, true)} />}
    <footer className="page-footer"><span>优先级 1–5，数值越高越先处理</span></footer>
    {editing && <SourceForm source={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void sources.reload(); }} />}
    {deleting && <Dialog title="删除信息源" onClose={() => setDeleting(null)}><p className="delete-description">确定删除「{deleting.name}」？删除后将停止从这个来源获取新内容。</p><div className="form-actions"><button className="button" onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void execute("delete", async () => { await api(`/api/sources/${deleting.id}`, { method: "DELETE" }); setDeleting(null); })}>删除信息源</button></div>{error && <ErrorNotice message={error} />}</Dialog>}
  </div>;
}
