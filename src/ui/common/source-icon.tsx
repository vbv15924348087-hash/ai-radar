import { FileText, Github, Globe2, Rss, Video } from "lucide-react";
import type { SourceType } from "@/domain/source";

export function SourceIcon({ type }: { type: SourceType }) {
  if (type === "X") return <span className="source-icon" title="X" aria-label="X">𝕏</span>;
  const Icon = { RSS: Rss, Blog: Globe2, GitHub: Github, Paper: FileText, YouTube: Video }[type];
  return <span className="source-icon" title={type} aria-label={type}><Icon size={14} strokeWidth={1.6} aria-hidden="true" /></span>;
}

