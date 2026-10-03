"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; active?.focus(); };
  }, []);
  return <dialog ref={ref} className="dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); closeRef.current(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="dialog-header"><span>{title}</span><button className="icon-button" onClick={onClose} aria-label="关闭对话框"><X size={19} /></button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
