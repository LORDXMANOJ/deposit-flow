import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { hrefWith, type SP } from "@/lib/list";

/** Sortable column header (link-based so it works without JS and keeps the URL shareable). */
export function SortTh({ label, field, base, sp, className = "" }: { label: string; field: string; base: string; sp: SP; className?: string }) {
  const active = sp.sort === field;
  const nextDir = active && sp.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : sp.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={className} aria-sort={active ? (sp.dir === "desc" ? "descending" : "ascending") : "none"}>
      <Link href={hrefWith(base, sp, { sort: field, dir: nextDir, page: undefined })} className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`} scroll={false}>
        {label}<Icon size={12} className={active ? "" : "opacity-40"} aria-hidden />
      </Link>
    </th>
  );
}
