"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FlaskConical, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./lab.module.css";

export function LabHeader({ lesson = false, children }: { lesson?: boolean; children?: ReactNode }) {
  return <header className={styles.header}>
    <Link href="/agent-lab" className={styles.brand}><span className={styles.brandMark}><FlaskConical size={21} /></span>Agent 实验室<span className={styles.brandCaption}>在操作中理解 AI</span></Link>
    <div className={styles.headerActions}>{children}<Link href={lesson ? "/agent-lab" : "/"} className={styles.quietLink}>{lesson ? <ArrowLeft size={15} /> : <ArrowUpRight size={15} />}{lesson ? "课程首页" : "返回工作台"}</Link></div>
  </header>;
}

export function LabDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { ref.current?.close(); document.body.style.overflow = overflow; active?.focus(); };
  }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""}`} aria-label={title} onCancel={event => { event.preventDefault(); close.current(); }}>
    <div className={styles.dialogHeader}><h2>{title}</h2><button className={styles.iconButton} onClick={onClose} aria-label="关闭，回到刚才"><X size={20} /></button></div>
    <div className={styles.dialogBody}>{children}</div>
  </dialog>;
}

export function WeatherDrawing({ compact = false }: { compact?: boolean }) {
  return <svg className={compact ? styles.compactDrawing : styles.weatherDrawing} viewBox="0 0 480 300" role="img" aria-label="成都城市与气象观测站的教学示意">
    <defs><pattern id="lab-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#a5b4a3" opacity=".3" /></pattern></defs>
    <rect width="480" height="300" fill="url(#lab-dots)" />
    <circle cx="338" cy="77" r="37" fill="#edb875" /><circle cx="338" cy="77" r="51" fill="none" stroke="#dba465" strokeDasharray="2 7" />
    <path d="M38 210H441M51 235H429" stroke="#a6b7a4" strokeWidth="1.5" />
    <g fill="#e5e9dc" stroke="#91a18d" strokeWidth="1.5"><path d="M70 209v-61h34v61m4 0v-99h43v99m14 0v-46h44v46m10 0v-118h40v118m8 0v-71h43v71m75 0v-71h42v71" /><path d="M218 91l21-16 21 16M68 148h38" /></g>
    <g stroke="#9daa96" strokeWidth="2"><path d="M120 126h18m-18 17h18m-18 17h18m-18 17h18m-18 17h18M230 111h17m-17 17h17m-17 17h17m-17 17h17m-17 17h17" /></g>
    <path d="M41 117c-1-11 9-19 19-15 4-21 34-22 40-2 21-4 27 25 7 27H53c-8 0-14-3-12-10Z" fill="#fafbf5" stroke="#a6b7a4" />
    <g stroke="#385948" strokeWidth="2.5" fill="none"><path d="M345 117v94m-14 0h29M314 128h61M345 117l14-8m-14 8-12-8" /><path d="M304 128l12-7v14Z" fill="#385948" /><path d="M375 128l-11-6v12Z" fill="#385948" /></g>
    <rect x="327" y="144" width="35" height="39" rx="3" fill="#fafbf5" stroke="#385948" strokeWidth="2" /><path d="M344 152v20" stroke="#cf795a" strokeWidth="3" /><circle cx="344" cy="172" r="5" fill="#cf795a" />
    <text x="240" y="268" textAnchor="middle" fill="#60715e" fontSize="11" letterSpacing="4">成都 · 天气观测示意</text>
  </svg>;
}
