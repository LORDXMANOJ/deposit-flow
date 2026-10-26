"use client";

import { RotateCcw } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-[520px] mx-auto py-20 text-center">
      <h1 className="text-[1.4rem] font-semibold tracking-[-0.02em]">This page could not load</h1>
      <p className="text-ink-3 mt-2 text-[0.9rem]">{error.message && !error.message.includes("digest") ? error.message : "Something went wrong while loading the data."}</p>
      {error.digest && <p className="mono text-[0.72rem] text-ink-3 mt-2">Reference {error.digest}</p>}
      <button className="btn btn-primary mt-6" onClick={reset}><RotateCcw size={14} /> Try again</button>
    </div>
  );
}
