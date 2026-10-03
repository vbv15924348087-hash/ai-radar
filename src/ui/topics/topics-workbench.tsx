"use client";

import { useState } from "react";
import { ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Topic } from "@/domain/topic";
import { api, errorMessage, useResource } from "@/ui/common/api";
import { Dialog } from "@/ui/common/dialog";
import { ErrorNotice, LoadingState } from "@/ui/common/feedback";
import { TopicForm } from "./topic-form";

export function TopicsWorkbench() {
  const topics = useResource<{ topics: Topic[] }>("/api/topics");
  const [editing, setEditing] = useState<Topic | "new" | null>(null);
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!deleting) return;
    setBusy(true); setError("");
    try { await api(`/api/topics/${deleting.id}`, { method: "DELETE" }); setDeleting(null); await topics.reload(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <div className="page topics-page">
    <header className="page-heading"><div><h1>研究主题</h1><p>{topics.data ? `${topics.data.topics.length} 个主题 · 关键词与权重参与后续分析` : "正在读取研究方向"}</p></div><button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />新增主题</button></header>
    <section className="topics-section" aria-label="研究主题列表" aria-busy={topics.loading}>
      {topics.error ? <ErrorNotice message={topics.error} retry={() => void topics.reload()} /> : topics.loading ? <LoadingState /> : !topics.data?.topics.length ? <div className="empty-state"><h2>尚未添加研究主题</h2><p>设置关键词与关注权重，让情报筛选贴近你的研究方向。</p><button className="button primary" onClick={() => setEditing("new")}><Plus size={15} />新增主题</button></div> : <div className="topic-list">{topics.data.topics.map(topic => <article className="topic-row" key={topic.id}>
        <div className="topic-content">
          <h2><Link href={`/library?topic=${encodeURIComponent(topic.id)}`} aria-label={`查看 ${topic.name} 相关情报`}>{topic.name}<ArrowUpRight size={14} /></Link></h2>
          {topic.description && <p>{topic.description}</p>}
          <div className="keyword-list" aria-label="关键词">{topic.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div>
        </div>
        <div className="topic-controls"><span className="topic-weight"><span>关注权重</span><strong>{topic.weight.toFixed(1)}×</strong></span><div className="table-actions"><button className="icon-button" onClick={() => setEditing(topic)} aria-label={`编辑 ${topic.name}`} title="编辑主题"><Pencil size={15} /></button><button className="icon-button danger-icon" onClick={() => { setError(""); setDeleting(topic); }} aria-label={`删除 ${topic.name}`} title="删除主题"><Trash2 size={15} /></button></div></div>
      </article>)}</div>}
    </section><footer className="page-footer"><span>权重 0.1–5.0 · 1.0 为常规关注</span><span>修改仅用于后续处理的情报</span></footer>
    {editing && <TopicForm topic={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void topics.reload(); }} />}
    {deleting && <Dialog title="删除研究主题" onClose={() => setDeleting(null)}><p className="delete-description">确定删除「{deleting.name}」？后续分析将不再使用这个研究主题。</p>{error && <ErrorNotice message={error} />}<div className="form-actions"><button className="button" onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? "删除中…" : "删除主题"}</button></div></Dialog>}
  </div>;
}
