"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { Topic } from "@/domain/topic";
import { api, errorMessage } from "@/ui/common/api";
import { Dialog } from "@/ui/common/dialog";
import { ErrorNotice } from "@/ui/common/feedback";

export function TopicForm({ topic, onClose, onSaved }: { topic?: Topic; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [keywords, setKeywords] = useState(topic?.keywords.join(", ") ?? "");
  const [weight, setWeight] = useState(topic?.weight ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const list = [...new Set(keywords.split(/[,，;；\n]/).map(keyword => keyword.trim()).filter(Boolean))];
      if (!list.length) throw new Error("请至少填写一个研究关键词。");
      await api(topic ? `/api/topics/${topic.id}` : "/api/topics", { method: topic ? "PATCH" : "POST", body: JSON.stringify({ name, description, keywords: list, weight }) }); onSaved();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Dialog title={topic ? "编辑研究主题" : "新增研究主题"} onClose={onClose}><form className="editor-form" onSubmit={event => void submit(event)}><p className="form-intro">告诉雷达你在研究什么。关键词与关注权重会参与相关性判断。</p>
    <label>主题名称<input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="如 Context Engineering" /></label>
    <label>研究方向<textarea rows={3} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="你关心哪些变化？希望从中得到什么？" /></label>
    <label>关键词<textarea rows={3} required value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="context window, context engineering, 上下文" aria-describedby="keyword-help" /></label><p className="field-help" id="keyword-help">用逗号或换行分隔，可混用中英文，最多 30 个关键词。</p>
    <label className="weight-field">关注权重<span className="weight-control"><input type="range" min="0.1" max="5" step="0.1" value={weight} onChange={event => setWeight(Number(event.target.value))} aria-label="关注权重" /><output>{weight.toFixed(1)}×</output></span></label><p className="field-help">1.0 为常规关注；更高权重会提升匹配内容的相关性评分。</p>
    {error && <ErrorNotice message={error} />}<div className="form-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit">{busy && <LoaderCircle size={15} className="spin" />}{busy ? "保存中…" : "保存主题"}</button></div>
  </form></Dialog>;
}
