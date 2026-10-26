"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useSWR } from "./use-swr";
import { BottomSheet } from "./sheet";
import { markNotificationRead } from "@/app/actions/workflow";
import { useToast } from "./toast";

type N = { id: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string; severity: string | null };
type Payload = { items: N[]; unread: number };

const SEV: Record<string, string> = { critical: "var(--bad-dot)", high: "#ea580c", warning: "var(--warn-dot)", info: "var(--info-dot)" };

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function NotificationCenter() {
  // #6 Shown instantly from cache, refreshed in the background, on focus, on reconnect, and every 60 s.
  const { data, mutate, revalidate } = useSWR<Payload>("/api/notifications", { interval: 60_000 });
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { toast } = useToast();
  const [, start] = useTransition();
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // #2 Optimistic "mark read": the list updates immediately and rolls back if the server refuses.
  const base = data ?? { items: [], unread: 0 };
  const [view, applyOptimistic] = useOptimistic(base, (cur: Payload, id: string) => {
    const items = cur.items.map((n) => (id === "all" || n.id === id) && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n);
    return { items, unread: items.filter((n) => !n.read_at).length };
  });

  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const set = () => setIsMobile(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, isMobile]);

  useEffect(() => { if (open) revalidate(); }, [open, revalidate]);

  const markRead = (id: string) => start(async () => {
    applyOptimistic(id);
    const r = await markNotificationRead(id);
    if (!r.ok) {
      toast({ title: "Couldn't mark as read", description: r.error, tone: "error" });
      return; // optimistic state is discarded automatically, so the item reverts to unread
    }
    mutate((cur) => {
      const items = (cur?.items ?? []).map((n) => (id === "all" || n.id === id) && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n);
      return { items, unread: items.filter((n) => !n.read_at).length };
    });
  });

  const list = (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs text-ink-3">{view.unread ? `${view.unread} unread` : "All caught up"}</p>
        <button className="btn btn-ghost btn-sm" disabled={!view.unread} onClick={() => markRead("all")}><CheckCheck size={14} /> Mark all read</button>
      </div>
      {view.items.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Bell className="mx-auto text-ink-3" size={22} aria-hidden />
          <p className="mt-2 text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-ink-3 mt-1">Run the alert checks to evaluate maturity and workflow rules.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {view.items.map((n) => (
            <li key={n.id} className={`relative flex gap-3 px-3 py-2.5 ${n.read_at ? "" : "bg-[color-mix(in_srgb,var(--accent-soft)_55%,transparent)]"}`}>
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.read_at ? "transparent" : SEV[n.severity ?? "info"], boxShadow: n.read_at ? "inset 0 0 0 1.5px var(--line-strong)" : undefined }} aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={n.link ?? "/alerts"} onClick={() => { setOpen(false); if (!n.read_at) markRead(n.id); }} className="block text-[0.84rem] font-semibold text-ink hover:underline">
                  {n.title}
                </Link>
                <p className="text-[0.78rem] text-ink-3 line-clamp-2">{n.body}</p>
                <p className="text-[0.7rem] text-ink-3 mt-0.5">{ago(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <button className="btn btn-ghost btn-sm self-start shrink-0 hit" onClick={() => markRead(n.id)} aria-label={`Mark "${n.title}" as read`}>Read</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-[var(--line)] p-2"><Link href="/alerts" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm w-full">Open Alerts & Notifications</Link></div>
    </div>
  );

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen((o) => !o)} className="btn btn-ghost btn-icon relative" aria-label={`Notifications${view.unread ? `, ${view.unread} unread` : ""}`} aria-expanded={open} aria-haspopup="dialog">
        <Bell size={18} />
        {view.unread > 0 && (
          <span className="badge-count absolute top-1 right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-[var(--bad-dot)] text-white text-[0.62rem] font-bold grid place-items-center ring-2 ring-[var(--surface)]">
            {view.unread > 99 ? "99+" : view.unread}
          </span>
        )}
      </button>
      {open && !isMobile && (
        <div ref={popRef} role="dialog" aria-label="Notifications" className="menu-pop absolute right-0 top-11 w-[400px] max-h-[70vh] overflow-y-auto scroll-thin card shadow-[var(--shadow-pop)] z-50 page-enter">
          <p className="px-3 pt-3 text-sm font-semibold">Notifications</p>
          {list}
        </div>
      )}
      <BottomSheet open={open && isMobile} onClose={() => setOpen(false)} title="Notifications">{list}</BottomSheet>
    </div>
  );
}
