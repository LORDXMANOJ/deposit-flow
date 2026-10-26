"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** #19 One UUID per "attempt to create": reused on every retry/double-submit, renewed after success. */
export function useIdempotencyKey() {
  const [key, setKey] = useState<string>("");
  useEffect(() => setKey(crypto.randomUUID()), []);
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return [key, renew] as const;
}

export function Field({ label, htmlFor, error, hint, children, className = "" }: {
  label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
      {error ? <p id={`${htmlFor}-error`} className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/**
 * Right-hand slide-over for forms. Transform transition (interruptible, #11), Esc and backdrop close,
 * focus moves into the panel, and an unsaved-changes guard when `dirty`.
 */
export function Drawer({ open, onClose, title, description, children, footer, dirty, width = 520 }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; dirty?: boolean; width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(), 60);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open, requestClose]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-[65]" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div className="scrim absolute inset-0 bg-[rgb(17_17_19/0.35)]" style={{ opacity: shown ? 1 : 0 }} onClick={requestClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className="drawer absolute inset-y-0 right-0 w-full flex flex-col bg-[var(--surface)] border-l border-[var(--line)] shadow-[var(--shadow-pop)] safe-top safe-bottom"
        style={{ maxWidth: width, transform: shown ? "translateX(0)" : "translateX(100%)" }}
        onTransitionEnd={() => !open && setMounted(false)}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--line)]">
          <div>
            <h2 className="text-[1.05rem] font-semibold tracking-[-0.015em]">{title}</h2>
            {description && <p className="text-[0.8rem] text-ink-3 mt-0.5">{description}</p>}
          </div>
          <button className="btn btn-ghost btn-icon -mr-2 hit" aria-label="Close" onClick={requestClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[var(--line)] flex items-center justify-end gap-2 bg-[var(--surface-2)]">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation for irreversible or financial actions. States exactly what will happen. */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = "primary", busy, onConfirm, onCancel, children }: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string; tone?: "primary" | "danger"; busy?: boolean;
  onConfirm: () => void; onCancel: () => void; children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="m-auto w-[min(460px,calc(100vw-2rem))] rounded-md border border-[var(--line)] bg-[var(--surface)] text-ink p-0 shadow-[var(--shadow-pop)] backdrop:bg-[rgb(17_17_19/0.4)]">
      <div className="p-5">
        <h2 className="text-[1.02rem] font-semibold">{title}</h2>
        <div className="text-[0.86rem] text-ink-2 mt-2 space-y-2">{body}</div>
        {children && <div className="mt-4">{children}</div>}
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--line)] bg-[var(--surface-2)]">
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </dialog>
  );
}
