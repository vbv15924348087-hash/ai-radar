import type { FeedResponse } from "./feed-types";

export function FeedMetrics({ metrics }: { metrics: FeedResponse["metrics"] | undefined }) {
  return <details className="feed-metrics"><summary>今日处理统计<span>{metrics?.scanned ?? "—"} 条扫描 · {metrics?.mustRead ?? "—"} 条强烈推荐</span></summary>
    <dl>{[
      ["今日扫描", metrics?.scanned], ["去重留存", metrics?.unique], ["与你相关", metrics?.relevant],
      ["值得一读", metrics?.worthRead], ["强烈推荐", metrics?.mustRead],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl>
  </details>;
}

