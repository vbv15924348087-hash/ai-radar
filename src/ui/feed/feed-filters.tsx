import { useEffect, useRef, useState } from "react";
import { Bookmark, Search, SlidersHorizontal, X } from "lucide-react";
import { SOURCE_TYPES } from "@/domain/source";
import type { Topic } from "@/domain/topic";
import { initialFilters, type LibraryFilters } from "./feed-types";

export function FeedFilters({ value, onChange, topics, savedView = false }: { value: LibraryFilters; onChange: (filters: LibraryFilters) => void; topics: Topic[]; savedView?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const update = <K extends keyof LibraryFilters>(key: K, next: LibraryFilters[K]) => onChange({ ...value, [key]: next });
  const filtered = Object.entries(value).some(([key, entry]) => Boolean(entry) && !(savedView && key === "favorite"));
  const advancedCount = Number(Boolean(value.from || value.to)) + Number(value.unread);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      const typing = event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable);
      if ((!typing && event.key === "/") || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault(); input.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  return <section className="filter-panel" aria-label="情报筛选">
    <div className="filter-row">
      <label className="search-field"><Search size={15} /><input ref={input} maxLength={200} aria-label="搜索情报" placeholder="搜索情报…" value={value.search} onChange={event => update("search", event.target.value)} />{value.search ? <button className="icon-button small" aria-label="清除搜索" onClick={() => update("search", "")}><X size={13} /></button> : <kbd>/</kbd>}</label>
      <label className="select-field"><span className="sr-only">研究主题</span><select value={value.topic} onChange={event => update("topic", event.target.value)}><option value="">全部主题</option>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
      <label className="select-field"><span className="sr-only">来源类型</span><select value={value.sourceType} onChange={event => update("sourceType", event.target.value)}><option value="">全部来源</option>{SOURCE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      {!savedView && <button className={`toolbar-button ${value.favorite ? "selected" : ""}`} aria-label="仅看收藏" aria-pressed={value.favorite} onClick={() => update("favorite", !value.favorite)}><Bookmark size={14} /><span>收藏</span></button>}
      <button className={`toolbar-button ${expanded || advancedCount ? "selected" : ""}`} onClick={() => setExpanded(!expanded)} aria-label={advancedCount ? `筛选 · ${advancedCount} 项已启用` : "筛选"} aria-expanded={expanded} aria-controls="advanced-filters"><SlidersHorizontal size={14} /><span>筛选{advancedCount ? ` · ${advancedCount}` : ""}</span></button>
      {filtered && <button className="icon-button" title="重置筛选" aria-label="重置筛选" onClick={() => onChange({ ...initialFilters, favorite: savedView })}><X size={14} /></button>}
    </div>
    {expanded && <div className="secondary-filters" id="advanced-filters">
      <label className="date-filter">开始日期<input aria-label="开始日期" type="date" max={value.to || undefined} value={value.from} onChange={event => update("from", event.target.value)} /></label>
      <label className="date-filter">结束日期<input aria-label="结束日期" type="date" min={value.from || undefined} value={value.to} onChange={event => update("to", event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={value.unread} onChange={event => update("unread", event.target.checked)} />仅未读</label>
      {(value.from || value.to) && <span className="field-help">按原文发布日期筛选</span>}
    </div>}
  </section>;
}

