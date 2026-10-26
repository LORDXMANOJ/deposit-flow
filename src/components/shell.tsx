"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Menu, Moon, Search, Sun, X, LogOut, ChevronRight, Clock } from "lucide-react";
import { NAV } from "@/lib/nav";
import { can, ROLE_LABEL, type Role } from "@/lib/rbac";
import { NAV_ICONS } from "./icons";
import { CommandMenu } from "./command-menu";
import { NotificationCenter } from "./notifications";
import { isTypingTarget, Keys, modLabel, useIsMac } from "./shortcuts";
import { LogoMark } from "./logo";
import { signOut } from "@/app/actions/auth";

export type ShellUser = { id: string; name: string; email: string; role: Role; institutionName: string | null };

export function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  const apply = () => {
    root.dataset.theme = next;
    try { localStorage.setItem("df-theme", next); } catch {}
  };
  // #9 Same-page change via the View Transitions API (cross-fade < 300 ms); instant swap as fallback.
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (d.startViewTransition && !reduce) d.startViewTransition(apply);
  else apply();
}

const GROUPS = ["Monitor", "Records", "Workflow", "Insight", "Admin"] as const;

export function AppShell({ user, clock, children }: { user: ShellUser; clock?: { offset: number; today: string } | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const mac = useIsMac();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("df-sidebar") === "1"); } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => {
    try { localStorage.setItem("df-sidebar", c ? "0" : "1"); } catch {}
    return !c;
  }), []);

  const items = NAV.filter((n) => !n.perm || can(user.role, n.perm));

  // #3/#4 Global shortcuts. Ctrl/⌘+K always works; single-key shortcuts are ignored while typing.
  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setCmdOpen((o) => !o);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || cmdOpen) return;
    if (e.key === "/") { e.preventDefault(); setCmdOpen(true); return; }
    if (e.key === "[") { toggleCollapsed(); return; }
    const w = window as Window & { __gPending?: number };
    if (e.key === "g") { w.__gPending = Date.now(); return; }
    if (w.__gPending && Date.now() - w.__gPending < 1200) {
      w.__gPending = 0;
      const hit = items.find((n) => n.keys === `g ${e.key.toLowerCase()}`);
      if (hit) { e.preventDefault(); router.push(hit.href); }
    }
  }, [cmdOpen, items, router, toggleCollapsed]);
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const current = items.slice().sort((a, b) => b.href.length - a.href.length).find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  const sub = current && pathname !== current.href ? pathname.slice(current.href.length + 1).split("/")[0] : null;
  const wide = !collapsed;

  const nav = (isMobile: boolean) => {
    const full = wide || isMobile;
    return (
      <nav aria-label="Main" className="flex-1 overflow-y-auto scroll-thin px-2.5 pb-3">
        {GROUPS.map((g, gi) => {
          const group = items.filter((i) => i.group === g);
          if (!group.length) return null;
          return (
            <div key={g} className={gi ? "mt-4" : ""}>
              {full ? <p className="px-2 pb-1 text-[0.72rem] font-medium text-ink-3">{g}</p> : gi > 0 && <hr className="mx-2 mb-2 border-[var(--line)]" />}
              <ul className="space-y-px">
                {group.map((n) => {
                  const Icon = NAV_ICONS[n.icon];
                  const active = current?.href === n.href;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        title={!full ? `${n.label} (${n.keys.toUpperCase()})` : undefined}
                        className={`group flex items-center gap-2.5 rounded-md h-8 tap text-[0.84rem] transition-colors
                          ${full ? "px-2" : "justify-center"}
                          ${active ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] font-medium" : "text-ink-2 hover:bg-[var(--sunken)] hover:text-ink"}`}
                      >
                        <Icon size={16} strokeWidth={1.75} aria-hidden className={active ? "text-[var(--accent)]" : "text-ink-3 group-hover:text-ink-2"} />
                        {full && <span className="truncate flex-1">{n.label}</span>}
                        {full && !isMobile && <span className="opacity-0 group-hover:opacity-100 transition-opacity mono text-[0.68rem] text-ink-3">{n.keys.toUpperCase()}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    );
  };

  const userBlock = (full: boolean) => (
    <div className="border-t border-[var(--line)] p-2.5">
      {full && (
        <p className="mx-0.5 mb-2.5 rounded-md border border-dashed border-[var(--line-strong)] px-2.5 py-2 text-[0.72rem] leading-snug text-ink-3">
          <span className="font-semibold text-ink-2">AICTE Regulation Bureau.</span> Security Deposit & FDR Management Portal (PS26265)
        </p>
      )}
      <div className={`flex items-center gap-2 ${full ? "" : "flex-col"}`}>
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-md bg-[var(--sunken)] text-ink-2 text-[0.72rem] font-semibold" aria-hidden>
          {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>
        {full && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[0.8rem] font-medium truncate">{user.name}</span>
            <span className="block text-[0.7rem] text-ink-3 truncate">{ROLE_LABEL[user.role]}</span>
          </span>
        )}
        <form action={signOut}>
          <button className="btn btn-ghost btn-icon hit" aria-label="Sign out" title="Sign out"><LogOut size={16} strokeWidth={1.75} /></button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex">
      <aside className={`sidebar hidden lg:flex flex-col sticky top-0 self-start h-dvh shrink-0 border-r border-[var(--line)] bg-[var(--canvas)] ${wide ? "w-[244px]" : "w-[60px]"}`}>
        <div className={`flex items-center h-14 shrink-0 ${wide ? "px-4 justify-between" : "justify-center"}`}>
          <Link href="/" className="flex items-center gap-2 text-ink" aria-label="DepositFlow home">
            <LogoMark size={22} />
            {wide && (
              <div className="flex flex-col min-w-0">
                <span className="text-[0.96rem] font-semibold tracking-[-0.02em] leading-tight">DepositFlow</span>
                <span className="text-[0.66rem] text-ink-3 truncate font-medium">AICTE Regulation Bureau</span>
              </div>
            )}
          </Link>
          {wide && (
            <button onClick={toggleCollapsed} className="btn btn-ghost btn-icon btn-sm hit" aria-label="Collapse sidebar" title="Collapse sidebar ( [ )">
              <PanelLeftClose size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!wide && (
          <button onClick={toggleCollapsed} className="btn btn-ghost btn-icon btn-sm mx-auto mb-2 hit" aria-label="Expand sidebar" title="Expand sidebar ( [ )">
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        )}
        {nav(false)}
        {userBlock(wide)}
      </aside>

      {/* Mobile drawer (interruptible transform transition, #11) */}
      <div className="lg:hidden fixed inset-0 z-[60]" style={{ pointerEvents: mobileOpen ? "auto" : "none" }} aria-hidden={!mobileOpen}>
        <div className="scrim absolute inset-0 bg-[rgb(17_17_19/0.4)]" style={{ opacity: mobileOpen ? 1 : 0 }} onClick={() => setMobileOpen(false)} />
        <aside className="drawer absolute inset-y-0 left-0 w-[82vw] max-w-[290px] flex flex-col bg-[var(--canvas)] border-r border-[var(--line)] safe-top safe-bottom"
          style={{ transform: mobileOpen ? "translateX(0)" : "translateX(-102%)" }} role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="flex items-center justify-between h-14 px-4">
            <span className="flex items-center gap-2"><LogoMark /><span className="font-semibold tracking-[-0.02em]">DepositFlow</span></span>
            <button className="btn btn-ghost btn-icon" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button>
          </div>
          {nav(true)}
          {userBlock(true)}
        </aside>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 glass-bar border-b border-[color-mix(in_srgb,var(--line)_70%,transparent)] safe-top">
          <div className="h-14 flex items-center gap-1.5 safe-x">
            <button className="btn btn-ghost btn-icon lg:hidden -ml-2" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-1 text-[0.84rem]">
              {current && current.href !== "/" ? (
                <>
                  <Link href={current.href} className={sub ? "text-ink-3 hover:text-ink truncate" : "font-medium text-ink truncate"} aria-current={sub ? undefined : "page"}>{current.label}</Link>
                  {sub && <><ChevronRight size={14} className="text-ink-3 shrink-0" aria-hidden /><span className="font-medium text-ink truncate" aria-current="page">{sub === "new" ? "New" : "Record"}</span></>}
                </>
              ) : <span className="font-medium">Overview</span>}
            </nav>
            <div className="flex-1" />
            <button onClick={() => setCmdOpen(true)} className="hidden md:flex items-center gap-2 h-8 w-[280px] pl-2.5 pr-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] text-ink-3 text-[0.82rem] hover:border-[var(--line-strong)]">
              <Search size={14} aria-hidden /> <span className="flex-1 text-left">Search or jump to</span> <Keys combo={`${modLabel(mac)} K`} />
            </button>
            <button onClick={() => setCmdOpen(true)} className="btn btn-ghost btn-icon md:hidden" aria-label="Search"><Search size={18} /></button>
            <button onClick={toggleTheme} className="btn btn-ghost btn-icon" aria-label="Toggle dark mode" title="Toggle theme">
              <Moon size={16} strokeWidth={1.75} className="dark:hidden" /><Sun size={16} strokeWidth={1.75} className="hidden dark:block" />
            </button>
            <NotificationCenter />
          </div>
        </header>
        {clock && (
          <div role="status" className="bg-[var(--violet-bg)] text-[var(--violet-ink)] border-b border-[color-mix(in_srgb,var(--violet-dot)_30%,transparent)] text-[0.8rem] safe-x py-2 flex flex-wrap items-center gap-x-2">
            <Clock size={14} aria-hidden />
            <span><strong>Simulated date: {clock.today}</strong> (real date {clock.offset > 0 ? "+" : ""}{clock.offset} days). Maturity rules and reminders use this date; record timestamps stay real.</span>
            {user.role === "admin" && <Link href="/settings#clock" className="underline underline-offset-2">Change</Link>}
          </div>
        )}
        <main id="main" className="flex-1 safe-x pt-6 pb-10 w-full max-w-[1440px] mx-auto">{children}</main>
      </div>

      <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} role={user.role} mac={mac} />
    </div>
  );
}
