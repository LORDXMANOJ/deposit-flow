import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { isScoped } from "@/lib/rbac";

/** Command-menu record search. Results respect the same institution scope as the pages. */
export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return NextResponse.json({ hits: [] }, { status: 401 });
  const term = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (term.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${term.toLowerCase()}%`;
  const scoped = isScoped(u.role);
  const p = scoped ? [like, u.institutionId] : [like];
  const sc = (col: string) => (scoped ? ` and ${col} = $2` : "");
  const [inst, dep, fdr] = await Promise.all([
    q<{ id: string; label: string; sub: string }>(`select id, name as label, code || ' · ' || state as sub from institutions
      where (lower(name) like $1 or lower(code) like $1 or lower(coalesce(aicte_ref,'')) like $1)${sc("id")} order by name limit 5`, p),
    q<{ id: string; label: string; sub: string }>(`select d.id, d.code as label, i.name || ' · ' || d.deposit_type as sub from deposits d join institutions i on i.id=d.institution_id
      where (lower(d.code) like $1 or lower(i.name) like $1 or lower(d.bank) like $1)${sc("d.institution_id")} order by d.code limit 5`, p),
    q<{ id: string; label: string; sub: string }>(`select f.id, f.fdr_number as label, i.name || ' · matures ' || f.maturity_date as sub from fdr_records f join institutions i on i.id=f.institution_id
      where (lower(f.fdr_number) like $1 or lower(f.code) like $1)${sc("f.institution_id")} order by f.maturity_date limit 5`, p),
  ]);
  return NextResponse.json({
    hits: [...fdr.map((x) => ({ ...x, type: "fdr" })), ...dep.map((x) => ({ ...x, type: "deposit" })), ...inst.map((x) => ({ ...x, type: "institution" }))],
  });
}
