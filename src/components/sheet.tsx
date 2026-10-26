"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * #10 Swipe-to-dismiss bottom sheet (mobile). The sheet follows the finger, closes when dragged
 * past 30% of its height or flicked down faster than 0.5 px/ms, and otherwise springs back.
 * #11 Release uses a CSS transition from the current dragged position, so an interrupted
 * open/close turns around from where it is instead of jumping; input is never blocked.
 * A visible close button is always present, and Esc closes it.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setDy(0);
      ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
  }, [open]);

  if (!mounted) return null;

  const onDown = (e: React.PointerEvent) => {
    // Only start a drag from the handle/header, or from content that is scrolled to the top.
    const scroller = ref.current?.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (scroller && scroller.contains(e.target as Node) && scroller.scrollTop > 0) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, v: 0 };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const raw = e.clientY - d.y;
    const next = raw < 0 ? raw / 4 : raw; // rubber-band when pulled up
    d.v = (next - d.dy) / Math.max(1, now - d.t);
    d.t = now;
    d.dy = next;
    setDy(next);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const h = ref.current?.offsetHeight ?? 400;
    if (d.dy > h * 0.3 || d.v > 0.5) onClose();
    else setDy(0);
  };

  const translate = open ? Math.max(dy, -24) : (ref.current?.offsetHeight ?? 800) + 40;

  return (
    <div className="fixed inset-0 z-[70] sm:hidden" aria-hidden={!open} style={{ pointerEvents: open ? "auto" : "none" }}>
      <div className="scrim absolute inset-0 bg-black/40" style={{ opacity: open ? Math.max(0, 1 - dy / 500) : 0 }} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet absolute inset-x-0 bottom-0 max-h-[85dvh] flex flex-col rounded-t-2xl bg-[var(--surface)] border-t border-[var(--line)] shadow-[var(--shadow-pop)] safe-bottom ${dragging ? "dragging" : ""}`}
        style={{ transform: `translateY(${translate}px)` }}
        onTransitionEnd={() => !open && setMounted(false)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="pt-2 pb-1 flex justify-center" aria-hidden><span className="h-1.5 w-10 rounded-full bg-[var(--line-strong)]" /></div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose} data-autofocus><X size={18} /></button>
        </div>
        <div data-sheet-scroll className="overflow-y-auto px-2 pb-4 scroll-thin">{children}</div>
      </div>
    </div>
  );
}
