"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; title: string; description?: string; tone: Tone; action?: { label: string; onClick: () => void | Promise<void> }; duration: number };
type Ctx = { toast: (t: Omit<Toast, "id" | "tone" | "duration"> & { tone?: Tone; duration?: number }) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback<Ctx["toast"]>((t) => {
    const id = ++seq;
    // #5 Undo toasts stay 8 s (within the 5-10 s window); plain toasts 4.5 s.
    const duration = t.duration ?? (t.action ? 8000 : 4500);
    setItems((xs) => [...xs.slice(-3), { id, tone: t.tone ?? "success", duration, ...t }]);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* role="status" + aria-live so screen readers announce results and the Undo option. */}
      <div role="status" aria-live="polite" className="fixed z-[80] bottom-0 right-0 left-0 sm:left-auto flex flex-col items-stretch sm:items-end gap-2 p-3 sm:p-4 safe-bottom pointer-events-none">
        {items.map((t) => <ToastItem key={t.id} t={t} onDone={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onDone }: { t: Toast; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => { timer.current = setTimeout(onDone, t.duration); }, [onDone, t.duration]);
  const stop = () => { if (timer.current) clearTimeout(timer.current); };
  useEffect(() => { start(); return () => stop(); }, [start]);

  const Icon = t.tone === "error" ? AlertTriangle : t.tone === "info" ? Info : CheckCircle2;
  const color = t.tone === "error" ? "var(--bad-dot)" : t.tone === "info" ? "var(--info-dot)" : "var(--ok-dot)";
  return (
    <div onMouseEnter={stop} onMouseLeave={start} onFocus={stop} onBlur={start}
      className="pointer-events-auto card shadow-[var(--shadow-pop)] w-full sm:w-[380px] flex items-start gap-3 p-3 page-enter">
      <Icon size={18} style={{ color }} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t.title}</p>
        {t.description && <p className="text-[0.8rem] text-ink-3 mt-0.5">{t.description}</p>}
      </div>
      {t.action && (
        <button className="btn btn-secondary btn-sm" disabled={busy}
          onClick={async () => { setBusy(true); await t.action!.onClick(); onDone(); }}>
          {t.action.label}
        </button>
      )}
      <button className="btn btn-ghost btn-sm btn-icon hit" aria-label="Dismiss notification" onClick={onDone}><X size={15} /></button>
    </div>
  );
}
