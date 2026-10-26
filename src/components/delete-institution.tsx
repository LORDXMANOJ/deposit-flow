"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteInstitution } from "@/app/actions/records";
import { ConfirmDialog } from "./forms";
import { useToast } from "./toast";

/** Permanent delete keeps a confirm dialog (it is not reversible). The server refuses it when records are linked. */
export function DeleteInstitution({ id, name, linked }: { id: string; name: string; linked: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn btn-ghost text-[var(--bad-ink)]" onClick={() => setOpen(true)} disabled={linked > 0}
        title={linked > 0 ? `${linked} linked deposit/FDR records. Archive instead.` : "Delete permanently"}>
        <Trash2 size={14} /> Delete
      </button>
      <ConfirmDialog open={open} tone="danger" title={`Delete ${name}?`} confirmLabel="Delete permanently" busy={pending}
        body={<p>This removes the institution record. It has no linked deposits or FDRs. The deletion itself is kept in the audit trail.</p>}
        onCancel={() => setOpen(false)}
        onConfirm={() => start(async () => {
          const r = await deleteInstitution(id);
          setOpen(false);
          if (!r.ok) { toast({ title: "Not deleted", description: r.error, tone: "error" }); return; }
          toast({ title: "Institution deleted", description: name });
          router.push("/institutions");
        })} />
    </>
  );
}
