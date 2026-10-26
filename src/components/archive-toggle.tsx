"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { setInstitutionStatus } from "@/app/actions/records";
import { useToast } from "./toast";

/**
 * #5 Archive is reversible, so there is no confirm dialog: it happens immediately and an Undo toast
 * (role="status", 8 s) restores it. The underlying change is a soft status flip, never a delete.
 */
export function ArchiveToggle({ id, name, status, compact }: { id: string; name: string; status: string; compact?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const archived = status === "inactive";

  const flip = (to: "active" | "inactive", withUndo: boolean) => start(async () => {
    const r = await setInstitutionStatus(id, to);
    if (!r.ok) { toast({ title: "Could not update", description: r.error, tone: "error" }); return; }
    router.refresh();
    if (withUndo)
      toast({
        title: to === "inactive" ? `Archived ${name}` : `Restored ${name}`,
        description: to === "inactive" ? "Hidden from active lists. Its records are kept." : undefined,
        tone: "info",
        action: { label: "Undo", onClick: async () => { await setInstitutionStatus(id, to === "inactive" ? "active" : "inactive"); router.refresh(); } },
      });
  });

  return (
    <button className={`btn btn-ghost ${compact ? "btn-sm btn-icon" : ""} hit`} disabled={pending}
      onClick={() => flip(archived ? "active" : "inactive", true)}
      aria-label={archived ? `Restore ${name}` : `Archive ${name}`} title={archived ? "Restore" : "Archive"}>
      {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{!compact && (archived ? " Restore" : " Archive")}
    </button>
  );
}
