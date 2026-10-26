"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts an integer up from 0 with a critically damped ease (no overshoot). Display only:
 * the server-rendered final value is in the HTML, so no-JS and screen readers get the real figure.
 * Instant under prefers-reduced-motion.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) { setShown(value); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(Math.round(value * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    setShown(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span aria-label={String(value)}>{shown}</span>;
}
