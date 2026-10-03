"use client";
import { ErrorNotice } from "@/ui/common/feedback";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="page"><h1>工作区暂时无法加载</h1><ErrorNotice message="读取内容时出现问题，请重试。" retry={reset} /></div>; }
