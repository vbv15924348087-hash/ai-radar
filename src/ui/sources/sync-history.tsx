import { RotateCcw } from "lucide-react";
import type { Source } from "@/domain/source";
import type { SyncRun } from "@/domain/sync";
import { formatDate } from "@/ui/common/api";

export function SyncHistory({ runs, sources, onRetry, busy }: { runs: SyncRun[]; sources: Source[]; onRetry: (sourceId: string) => void; busy: boolean }) {
  return <section className="sync-history"><div className="section-heading"><h2>同步记录</h2><span className="count-label">最近 {Math.min(runs.length, 12)} 次</span></div>
    {!runs.length ? <div className="quiet-empty">尚无同步记录。添加信息源后，运行一次同步。</div> : <div className="sync-runs">{runs.slice(0, 12).map(run => {
      const source = sources.find(entry => entry.id === run.sourceId);
      const failed = run.state === "failed" || run.failed > 0;
      return <details className="sync-run" key={run.id}><summary><span className={`run-dot ${failed ? "failed" : run.state}`} /><strong>{source?.name ?? "已删除的信息源"}</strong><span className="run-state">{run.state === "processing" ? "处理中" : failed ? "存在失败" : "已完成"}</span><span className="run-counts">发现 {run.discovered} · 分析 {run.analyzed} · 去重 {run.duplicates}</span><time>{formatDate(run.startedAt, true)}</time><span className="run-duration">{(run.durationMs / 1000).toFixed(1)}s</span></summary><div className="run-details"><dl><div><dt>发现</dt><dd>{run.discovered}</dd></div><div><dt>获取</dt><dd>{run.fetched}</dd></div><div><dt>去重</dt><dd>{run.duplicates}</dd></div><div><dt>分析</dt><dd>{run.analyzed}</dd></div><div><dt>失败</dt><dd>{run.failed}</dd></div><div><dt>分析耗时</dt><dd>{(run.aiDurationMs / 1000).toFixed(1)}s</dd></div></dl>{run.errors.map((failure, index) => <div className="run-error" key={index}><span>{failure.stage} · 第 {failure.attempts} 次 · {failure.retryable ? "可重试" : "需检查配置"}</span><p>{failure.error}</p><time>{formatDate(failure.timestamp, true)}</time></div>)}{failed && source && <button className="button" disabled={busy || !source.enabled} onClick={() => onRetry(source.id)}><RotateCcw size={14} />重试失败内容</button>}</div></details>;
    })}</div>}
  </section>;
}
