import { CircleCheck, CirclePause, Pencil, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import type { Source } from "@/domain/source";
import { formatDate } from "@/ui/common/api";
import { SourceIcon } from "@/ui/common/source-icon";

export function SourceTable({ sources, busy, onEdit, onDelete, onToggle, onSync }: { sources: Source[]; busy: boolean; onEdit: (source: Source) => void; onDelete: (source: Source) => void; onToggle: (source: Source) => void; onSync: (source: Source) => void }) {
  return <div className="table-scroll" role="region" aria-label="信息源表格" tabIndex={0}><table className="source-table"><thead><tr><th scope="col">名称 / 地址</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">上次检查</th><th scope="col" className="align-right">操作</th></tr></thead><tbody>{sources.map(source => <tr key={source.id} className={!source.enabled ? "source-disabled" : ""}>
    <td><strong className="table-source-name">{source.name}</strong><span className="table-source-url" title={source.urlOrIdentifier}>{source.urlOrIdentifier}</span>{source.lastError && <details className="source-error"><summary>查看采集错误</summary><p>{source.lastError}</p></details>}</td>
    <td><span className="table-source-type"><SourceIcon type={source.type} />{source.type}</span></td><td><span className="source-priority" aria-label={`优先级 ${source.priority} / 5`}>{source.priority}<span> / 5</span></span></td>
    <td><button disabled={busy} className={`status-switch ${!source.enabled ? "paused" : source.lastError ? "failed" : "enabled"}`} onClick={() => onToggle(source)} aria-label={`${source.enabled ? "停用" : "启用"} ${source.name}`} aria-pressed={source.enabled}>{!source.enabled ? <CirclePause size={13} /> : source.lastError ? <TriangleAlert size={13} /> : <CircleCheck size={13} />}{!source.enabled ? "已停用" : source.lastError ? "采集失败" : "已启用"}</button></td>
    <td className="table-time">{source.lastCheckedAt ? formatDate(source.lastCheckedAt, true) : "尚未同步"}</td><td><div className="table-actions"><button className="icon-button" disabled={busy || !source.enabled} onClick={() => onSync(source)} aria-label={`同步 ${source.name}`} title="同步此来源"><RefreshCw size={15} /></button><button className="icon-button" disabled={busy} onClick={() => onEdit(source)} aria-label={`编辑 ${source.name}`} title="编辑"><Pencil size={15} /></button><button className="icon-button danger-icon" disabled={busy} onClick={() => onDelete(source)} aria-label={`删除 ${source.name}`} title="删除"><Trash2 size={15} /></button></div></td>
  </tr>)}</tbody></table></div>;
}
