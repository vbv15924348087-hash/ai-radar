"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Archive, Bookmark, CircleHelp, Compass, FlaskConical, Keyboard, Layers3, Newspaper, Radar, Radio } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { useResource } from "./api";

const navigation = [
  { href: "/briefings", label: "每日精选", icon: Newspaper },
  { href: "/", label: "今日情报", icon: Compass },
  { href: "/library", label: "全部情报", icon: Archive },
  { href: "/library?favorite=true", label: "已收藏", icon: Bookmark },
  { href: "/sources", label: "信息源", icon: Radio },
  { href: "/topics", label: "研究主题", icon: Layers3 },
  { href: "/agent-lab", label: "Agent 实验室", icon: FlaskConical },
];

function Navigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = pathname === "/library" && params.get("favorite") === "true" ? "/library?favorite=true" : pathname;
  return <nav aria-label="主导航">{navigation.map(({ href, label, icon: Icon }) => <Link
    key={href} href={href} className={`nav-link ${active === href ? "active" : ""} ${href === "/sources" ? "nav-group-start" : ""}`}
    aria-label={label} aria-current={active === href ? "page" : undefined}><Icon size={16} strokeWidth={1.7} /><span>{label}</span>
  </Link>)}</nav>;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [help, setHelp] = useState(false);
  const pathname = usePathname();
  const session = useResource<{ cloud: boolean; authenticated: boolean; accessMode: string }>("/api/session");
  if (pathname === "/agent-lab" || pathname.startsWith("/agent-lab/")) {
    return <main id="main-content">{children}</main>;
  }
  return <div className="workspace">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="AI Radar 首页"><span className="brand-emblem"><Radar size={24} strokeWidth={1.7} /></span><span className="brand-wordmark"><strong>AI RADAR</strong><small>INTELLIGENCE / {session.data?.cloud ? "CLOUD" : "LOCAL"}</small></span></Link>
      <div className="workspace-label"><span>个人工作区</span><span>SYS / 01</span></div>
      <Suspense fallback={<div className="nav-placeholder" />}><Navigation /></Suspense>
      <div className="sidebar-bottom">
        <button className="nav-link help-link" aria-label="使用帮助" onClick={() => setHelp(true)}><CircleHelp size={16} /><span>使用帮助</span><Keyboard size={14} /></button>
        {session.data?.cloud && !session.data.authenticated && <Link className="nav-link" href="/unlock"><CircleHelp size={16} /><span>解锁云端工作区</span></Link>}
        <div className="sidebar-footer"><span className="status-dot" />{session.data?.cloud ? "云端工作区" : "本地工作区"}<span>v0.1</span></div>
      </div>
    </aside>
    <div className="main-shell"><main id="main-content">{children}</main></div>
    {help && <Dialog title="使用 AI Radar" onClose={() => setHelp(false)}>
      <p className="form-intro">扫描信息流，打开简报，收藏值得保留的发现。</p>
      <dl className="keyboard-help">
        <div><dt>搜索情报</dt><dd><kbd>/</kbd> 或 <kbd>Ctrl K</kbd></dd></div>
        <div><dt>上一条 / 下一条</dt><dd><kbd>K</kbd> / <kbd>J</kbd></dd></div>
        <div><dt>列表内移动</dt><dd><kbd>↑</kbd> <kbd>↓</kbd></dd></div>
        <div><dt>打开选中的情报</dt><dd><kbd>Enter</kbd></dd></div>
        <div><dt>关闭阅读面板</dt><dd><kbd>Esc</kbd></dd></div>
      </dl>
      <p className="field-help">今日情报按处理日期收录，优先显示推荐分最高的 10 条。全部情报包含历史内容，支持日期、主题、来源、收藏与未读筛选。</p>
    </Dialog>}
  </div>;
}
