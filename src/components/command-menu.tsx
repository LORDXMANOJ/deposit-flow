"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, Zap, Plus, Moon, CornerDownLeft, Building2, Landmark, FileStack } from "lucide-react";
import { NAV } from "@/lib/nav";
import { can, type Role } from "@/lib/rbac";
import { NAV_ICONS } from "./icons";
import { Keys, modLabel } from "./shortcuts";
import { runChecksNow } from "@/app/actions/workflow";
import { useToast } from "./toast";
import { toggleTheme } from "./shell";

type Item = { id: string; label: string; hint?: string; group: string; keys?: string; icon: React.ReactNode; run: () => void };
type Hit = { type: "institution" | "deposit" | "fdr"; id: string; label: string; sub: string };

/** #3 Command menu: every page and main action, fully keyboard operable (↑ ↓ Enter Esc). */
export function CommandMenu({ open, onClose, role, mac }: { open: boolean; onClose: () => void; role: Role; mac: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); setHits([]); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // Record search (debounced, server-side and permission-scoped).
  useEffect(() => {
    if (!open || query.trim().length < 2) { setHits([]); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] })).then((j) => setHits(j.hits ?? [])).catch(() => {});
    }, 160);
    return () => { clearTimeout(t); ac.abort(); };
  }, [query, open]);

  const go = (href: string) => { onClose(); router.push(href); };

  const items: Item[] = useMemo(() => {
    const pages: Item[] = NAV.filter((n) => !n.perm || can(role, n.perm)).map((n) => {
      const Icon = NAV_ICONS[n.icon];
      return { id: "p" + n.href, label: n.label, group: "Pages", keys: n.keys, icon: <Icon size={16} />, run: () => go(n.href) };
    });
    const actions: Item[] = [];
    if (can(role, "deposit.write")) actions.push({ id: "a-dep", label: "New security deposit", hint: "with linked FDR", group: "Actions", icon: <Plus size={16} />, run: () => go("/deposits/new") });
    if (can(role, "institution.write")) actions.push({ id: "a-inst", label: "New institution", group: "Actions", icon: <Plus size={16} />, run: () => go("/institutions?new=1") });
    if (can(role, "release.create")) actions.push({ id: "a-rel", label: "New release request", group: "Actions", icon: <Plus size={16} />, run: () => go("/releases?new=1") });
    if (can(role, "alert.run")) actions.push({
      id: "a-run", label: "Run alert checks now", hint: "evaluates every enabled rule", group: "Actions", icon: <Zap size={16} />,
      run: () => {
        onClose();
        start(async () => {
          const r = await runChecksNow();
          if (r.ok) toast({ title: `Checks complete: ${r.summary.created} new alert${r.summary.created === 1 ? "" : "s"}`, description: `${r.summary.candidates} conditions found, ${r.summary.autoResolved} auto-resolved.` });
          else toast({ title: "Could not run checks", description: r.error, tone: "error" });
          router.refresh();
        });
      },
    });
    actions.push({ id: "a-theme", label: "Toggle dark mode", group: "Actions", icon: <Moon size={16} />, run: () => { onClose(); toggleTheme(); } });
    const recordIcon = { institution: <Building2 size={16} />, deposit: <Landmark size={16} />, fdr: <FileStack size={16} /> };
    const recordHref = { institution: "/institutions/", deposit: "/deposits/", fdr: "/fdrs/" };
    const records: Item[] = hits.map((h) => ({ id: h.type + h.id, label: h.label, hint: h.sub, group: "Records", icon: recordIcon[h.type], run: () => go(recordHref[h.type] + h.id) }));
    const ql = query.trim().toLowerCase();
    const match = (i: Item) => !ql || i.label.toLowerCase().includes(ql) || (i.hint ?? "").toLowerCase().includes(ql);
    return [...records, ...pages.filter(match), ...actions.filter(match)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hits, query]);

  useEffect(() => { if (active >= items.length) setActive(Math.max(0, items.length - 1)); }, [items.length, active]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault(); // keep focus in the dialog
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-3 pt-[12vh] safe-top" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-[rgb(8_15_30/0.45)]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Command menu" className="menu-pop relative w-full max-w-[620px] card shadow-[var(--shadow-pop)] overflow-hidden page-enter">
        <div className="flex items-center gap-2.5 px-4 border-b border-[var(--line)]">
          <Search size={17} className="text-ink-3" aria-hidden />
          <input
            ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search institutions, deposits, FDR numbers, pages, actions…"
            className="flex-1 h-12 bg-transparent outline-none text-[0.95rem] placeholder:text-ink-3"
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="cmd-list" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto scroll-thin p-1.5">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-3">No matches for “{query}”.</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="px-2.5 pt-2.5 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.07em] text-ink-3" role="presentation">{header}</p>}
                <div
                  id={`cmd-${i}`} data-index={i} role="option" aria-selected={i === active}
                  onMouseMove={() => setActive(i)} onClick={() => it.run()}
                  className={`flex items-center gap-3 px-2.5 h-10 rounded-md cursor-pointer text-sm ${i === active ? "bg-[var(--accent-soft)] text-ink" : "text-ink-2"}`}
                >
                  <span className="text-ink-3 shrink-0">{it.icon}</span>
                  <span className="truncate font-medium">{it.label}</span>
                  {it.hint && <span className="truncate text-ink-3 text-xs">{it.hint}</span>}
                  <span className="flex-1" />
                  {it.keys && <Keys combo={it.keys} />}
                  {i === active && <CornerDownLeft size={14} className="text-ink-3" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-[var(--line)] text-[0.72rem] text-ink-3 bg-[var(--surface-2)]">
          <span className="inline-flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span className="inline-flex items-center gap-1"><kbd>↵</kbd> open</span>
          <span className="inline-flex items-center gap-1"><Keys combo={`${modLabel(mac)} K`} /> toggle</span>
          <span className="inline-flex items-center gap-1"><kbd>/</kbd> search</span>
          <span className="inline-flex items-center gap-1"><kbd>G</kbd> then letter: go to page</span>
        </div>
      </div>
    </div>
  );
}
