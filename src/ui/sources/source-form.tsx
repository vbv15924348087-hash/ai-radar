"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { SOURCE_TYPES, type Source, type SourceInput, type SourceType } from "@/domain/source";
import { api, errorMessage } from "@/ui/common/api";
import { Dialog } from "@/ui/common/dialog";
import { ErrorNotice } from "@/ui/common/feedback";

const sourceHelp: Record<SourceType, { label: string; placeholder: string; help: string }> = {
  RSS: { label: "RSS / Atom 地址", placeholder: "https://openai.com/news/rss.xml", help: "填写公开可访问的 RSS 或 Atom 订阅地址。" },
  Blog: { label: "博客订阅地址", placeholder: "https://example.com/feed.xml", help: "使用官方博客的 RSS / Atom 订阅链接，暂不支持普通网页地址。" },
  GitHub: { label: "代码仓库", placeholder: "openai/codex", help: "填写 owner/repository 或 GitHub 仓库 URL；同步公开发布版本。" },
  Paper: { label: "arXiv 查询 / 论文订阅地址", placeholder: "cat:cs.AI", help: "支持 arXiv 查询（如 cat:cs.AI）或公开论文 RSS / Atom 地址。" },
  YouTube: { label: "频道 ID / 频道地址", placeholder: "UC 开头的频道 ID", help: "填写 24 位 UC 频道 ID 或 /channel/ 地址。获取视频元数据与描述；不包含视频字幕。" },
  X: { label: "账号用户名", placeholder: "@karpathy", help: "需要服务端配置 X_BEARER_TOKEN，并具备读取用户时间线的 API 权限。" },
};

export function SourceForm({ source, onClose, onSaved }: { source?: Source; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<SourceInput>(source ?? { name: "", type: "RSS", urlOrIdentifier: "", enabled: true, priority: 3, metadata: {} });
  const [metadata, setMetadata] = useState(JSON.stringify(source?.metadata ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(metadata); } catch { throw new Error("附加元数据必须是有效的 JSON 对象。"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some(entry => typeof entry !== "string")) throw new Error("附加元数据需要使用字符串键值对，例如 {\"language\": \"en\"}。");
      const payload = { name: value.name, type: value.type, urlOrIdentifier: value.urlOrIdentifier, enabled: value.enabled, priority: value.priority, metadata: parsed };
      await api(source ? `/api/sources/${source.id}` : "/api/sources", { method: source ? "PATCH" : "POST", body: JSON.stringify(payload) }); onSaved();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  const help = sourceHelp[value.type];
  return <Dialog title={source ? "编辑信息源" : "添加信息源"} onClose={onClose}><form className="editor-form" onSubmit={event => void submit(event)}>
    <p className="form-intro">从一手信息开始。为来源设置名称、地址与采集优先级。</p>
    <label>名称<input required maxLength={120} autoFocus value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} placeholder="如 OpenAI 官方博客" /></label>
    <label>来源类型<select value={value.type} onChange={event => setValue({ ...value, type: event.target.value as SourceType })}>{SOURCE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
    <label>{help.label}<input required maxLength={2000} value={value.urlOrIdentifier} onChange={event => setValue({ ...value, urlOrIdentifier: event.target.value })} placeholder={help.placeholder} aria-describedby="source-location-help" /></label><p className="field-help" id="source-location-help">{help.help}</p>
    <div className="form-two-columns"><label>优先级<select value={value.priority} onChange={event => setValue({ ...value, priority: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map(priority => <option value={priority} key={priority}>{priority} · {priority === 5 ? "最高" : priority === 1 ? "最低" : priority === 3 ? "常规" : priority === 4 ? "较高" : "较低"}</option>)}</select></label><label className="checkbox-label enabled-field"><input type="checkbox" checked={value.enabled} onChange={event => setValue({ ...value, enabled: event.target.checked })} />启用自动采集</label></div>
    <details className="advanced-fields"><summary>附加元数据</summary><label><span className="sr-only">元数据 JSON</span><textarea rows={4} className="code-input" value={metadata} onChange={event => setMetadata(event.target.value)} /></label><p className="field-help">可选的字符串键值对，以 JSON 格式保存。</p></details>
    {error && <ErrorNotice message={error} />}<div className="form-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}{busy ? "保存中…" : "保存信息源"}</button></div>
  </form></Dialog>;
}
