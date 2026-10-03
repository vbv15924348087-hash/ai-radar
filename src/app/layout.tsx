import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/ui/common/workspace-shell";
import "./globals.css";

export const metadata: Metadata = { title: "AI Radar · 个人情报工作台", description: "从可信来源发现、分析与沉淀值得知道的 AI 情报。" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><a className="skip-link" href="#main-content">跳转到内容</a><WorkspaceShell>{children}</WorkspaceShell></body></html>;
}
