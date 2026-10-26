"use client";

import { useState, useTransition } from "react";
import { updateDepositNotes, setRemarks } from "@/app/actions/records";
import { useToast } from "./toast";

/** Inline notes with explicit save (audited). */
export function NotesEditor({ id, initial, kind, editable }: { id: string; initial: string; kind: "deposit" | "fdr"; editable: boolean }) {
  const { toast } = useToast();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  if (!editable) return <p className="p-4 text-[0.86rem] text-ink-2 whitespace-pre-wrap">{initial || <span className="text-ink-3">No notes.</span>}</p>;
  return (
    <div className="p-4">
      <label htmlFor={`notes-${id}`} className="sr-only">Internal notes</label>
      <textarea id={`notes-${id}`} className="input" rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex justify-end mt-2">
        <button className="btn btn-secondary btn-sm" disabled={pending || value === saved} onClick={() => start(async () => {
          const r = kind === "deposit" ? await updateDepositNotes(id, value) : await setRemarks(id, value);
          if (!r.ok) { toast({ title: "Not saved", description: r.error, tone: "error" }); return; }
          setSaved(value);
          toast({ title: "Notes saved" });
        })}>{pending ? "Saving…" : "Save notes"}</button>
      </div>
    </div>
  );
}
