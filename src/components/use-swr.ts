"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * #6 Stale-while-revalidate, ~40 lines instead of a dependency. Shows cached data instantly
 * (memory, then sessionStorage), refetches in the background, again on window focus, when the
 * network comes back, and on an interval. Used ONLY for notifications and search lists, never
 * for financial totals, which are always rendered fresh on the server.
 */

const memory = new Map<string, unknown>();

export function useSWR<T>(url: string, opts: { interval?: number } = {}) {
  const read = (): T | undefined => {
    if (memory.has(url)) return memory.get(url) as T;
    try {
      const s = sessionStorage.getItem("swr:" + url);
      return s ? (JSON.parse(s) as T) : undefined;
    } catch { return undefined; }
  };
  const [data, setData] = useState<T | undefined>(undefined);
  const [validating, setValidating] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const revalidate = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    setValidating(true);
    try {
      const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as T;
      memory.set(url, json);
      try { sessionStorage.setItem("swr:" + url, JSON.stringify(json)); } catch {}
      setData(json);
    } catch { /* offline or aborted: keep showing stale data */ }
    finally { if (inflight.current === ac) setValidating(false); }
  }, [url]);

  const mutate = useCallback((next: T | ((cur: T | undefined) => T)) => {
    setData((cur) => {
      const v = typeof next === "function" ? (next as (c: T | undefined) => T)(cur) : next;
      memory.set(url, v);
      return v;
    });
  }, [url]);

  useEffect(() => {
    const cached = read();
    if (cached !== undefined) setData(cached);
    revalidate();
    const onFocus = () => document.visibilityState === "visible" && revalidate();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", onFocus);
    const id = opts.interval ? setInterval(revalidate, opts.interval) : null;
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", onFocus);
      if (id) clearInterval(id);
      inflight.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { data, validating, revalidate, mutate };
}
