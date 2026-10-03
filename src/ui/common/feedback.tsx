import { AlertCircle, ArrowUpRight, LoaderCircle, Radio } from "lucide-react";
import Link from "next/link";
import type { ProviderStatus } from "./api";

export function LoadingState({ label = "正在读取工作区…" }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={18} /><span>{label}</span></div>;
}

export function FeedSkeleton() {
  return <div className="feed-skeleton" role="status"><span className="sr-only">正在读取情报…</span>{Array.from({ length: 8 }, (_, index) => <div className="skeleton-row" key={index} aria-hidden="true"><span /><span /><span /></div>)}</div>;
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice error-notice" role="alert"><AlertCircle size={16} /><span>{message}</span>{retry && <button className="text-button" onClick={retry}>重试</button>}</div>;
}

export function ProviderNotice({ provider }: { provider?: ProviderStatus }) {
  if (!provider) return null;
  const label = provider.development ? "规则分析 · 未启用 AI 总结" : !provider.configured ? `${provider.name} · AI 服务尚未配置` : `${provider.name} · AI 结构化分析`;
  return <div className={`provider-notice ${provider.development ? "development" : ""}`}><span className="provider-dot" /><span>{label}</span>
    {provider.development && <span className="provider-explanation">内容为原文摘录与关键词评分</span>}
    {!provider.development && !provider.configured && <span className="provider-explanation">请在服务端配置 API 密钥后重试分析</span>}
  </div>;
}

export function EmptyFeed({ filtered = false, today = false, reset, savedView = false }: { filtered?: boolean; today?: boolean; reset?: () => void; savedView?: boolean }) {
  return <div className="empty-state"><Radio size={26} strokeWidth={1.3} />
    <h2>{filtered ? "没有符合条件的情报" : savedView ? "这里还没有收藏的情报" : today ? "今天还没有新的情报" : "你的信息流从这里开始"}</h2>
    <p>{filtered ? "减少筛选条件，或换一个搜索词。" : savedView ? "在信息流或阅读面板中点击收藏，留住值得再看的内容。" : today ? "同步已启用的来源，或打开全部情报继续阅读。" : "添加你信任的信息源，同步后即可阅读。"}</p>
    <div className="empty-actions">{filtered && reset ? <button className="button" onClick={reset}>清除筛选</button> : <Link href={today || savedView ? "/library" : "/sources"} className="button">{today || savedView ? "浏览全部情报" : "添加信息源"}<ArrowUpRight size={14} /></Link>}</div>
  </div>;
}

