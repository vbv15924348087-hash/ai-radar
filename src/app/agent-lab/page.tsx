import type { Metadata } from "next";
import { LabHome } from "@/features/agent-lab/lab-home";

export const metadata: Metadata = {
  title: "Agent 实验室 · 在操作中理解 AI",
  description: "沿着一次天气查询，亲手观察目标、请求、执行与返回怎样形成一个 Agent 循环。",
};

export default function AgentLabPage() { return <LabHome />; }
