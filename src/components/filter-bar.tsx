"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";

export type FilterDef =
  | { type: "search"; name: string; placeholder: string }
  | { type: "select"; name: string; label: string; options: Array<{ value: string; label: string }> }
  | { type: "date"; name: string; label: string };

/** URL-driven filters, so every filtered view is linkable and the back button works. */
export function FilterBar({ filters, children }: { filters: FilterDef[]; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const searchDef = filters.find((f) => f.type === "search");
  const [text, setText] = useState(searchDef ? sp.get(searchDef.name) ?? "" : "");
  const first = useRef(true);

  const push = (updates: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) v ? next.set(k, v) : next.delete(k);
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? "?" + next.toString() : ""}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!searchDef) return;
    const t = setTimeout(() => push({ [searchDef.name]: text.trim() }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const active = filters.filter((f) => f.type !== "search" && sp.get(f.name));

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-[var(--line)]">
      <div className="flex flex-wrap items-center gap-2">
        {searchDef && (
          <label className="relative flex-1 min-w-[220px] max-w-[420px]">
            <span className="sr-only">{searchDef.placeholder}</span>
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input className="input !pl-8 !h-9" type="search" placeholder={searchDef.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {filters.map((f) => {
          if (f.type === "select")
            return (
              <label key={f.name} className="flex items-center">
                <span className="sr-only">{f.label}</span>
                <select className="input !h-9 !w-auto pr-8 text-[0.85rem]" value={sp.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })}>
                  <option value="">{f.label}: All</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            );
          if (f.type === "date")
            return (
              <label key={f.name} className="flex items-center gap-1.5 text-[0.78rem] text-ink-3">
                {f.label}
                <input type="date" className="input !h-9 !w-[150px] text-[0.85rem]" value={sp.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })} />
              </label>
            );
          return null;
        })}
        {pending && <Loader2 size={16} className="animate-spin text-ink-3" aria-label="Updating" />}
        <div className="flex-1" />
        {children}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((f) => {
            const v = sp.get(f.name)!;
            const label = f.type === "select" ? f.options.find((o) => o.value === v)?.label ?? v : v;
            return (
              <button key={f.name} onClick={() => push({ [f.name]: "" })} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--info-ink)] text-[0.75rem] font-medium hover:brightness-95">
                {"label" in f ? f.label : f.name}: {label} <X size={13} aria-label="Remove filter" />
              </button>
            );
          })}
          <button className="text-[0.75rem] text-ink-3 hover:text-ink underline-offset-2 hover:underline ml-1" onClick={() => push(Object.fromEntries(active.map((f) => [f.name, ""])))}>Clear all</button>
        </div>
      )}
    </div>
  );
}
