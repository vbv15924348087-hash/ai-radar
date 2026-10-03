"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";

export default function UnlockPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function unlock(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "解锁失败");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/briefings");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解锁失败，请重试"); setBusy(false); }
  }
  return <section className="page" style={{ maxWidth: 560, paddingTop: 80 }}>
    <div className="digest-eyebrow"><LockKeyhole size={16} /> AI RADAR / CLOUD</div>
    <h1>解锁工作区</h1><p style={{ color: "var(--secondary)", margin: "14px 0 28px" }}>输入工作区访问口令，继续阅读简报、保存选题与管理来源。</p>
    <form onSubmit={unlock}>
      <label htmlFor="workspace-password">访问口令</label>
      <input id="workspace-password" type="password" autoComplete="current-password" required maxLength={512} value={password} onChange={event => setPassword(event.target.value)} style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 20px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }} />
      {error && <p role="alert" style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</p>}
      <button className="button primary" disabled={busy} type="submit">{busy ? "正在解锁…" : "进入工作区"}</button>
    </form>
  </section>;
}
