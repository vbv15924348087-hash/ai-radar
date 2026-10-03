"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ProviderStatus { name: string; configured: boolean; development: boolean }

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `请求失败 (${response.status})`);
  return body as T;
}

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await api<T>(path);
      if (request === generation.current) setData(next);
    } catch (cause) {
      if (request === generation.current) setError(errorMessage(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  return { data, error, loading, reload, setData };
}

export function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : "操作未完成，请重试。"; }
export function formatDate(value: string | null, full = false) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", full
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "short", day: "numeric" }).format(date);
}
