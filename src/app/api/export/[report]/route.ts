import { NextResponse } from "next/server";
import { getUser, toActor } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getReport, totalOf } from "@/lib/reports";
import { toCsv } from "@/lib/format";
import { audit } from "@/lib/audit";
import { todayISO } from "@/lib/maturity";

/** CSV export. Same permission and institution scope as the on-screen report, plus report.export. */
export async function GET(req: Request, ctx: { params: Promise<{ report: string }> }) {
  const { report } = await ctx.params;
  const u = await getUser();
  if (!u) return new NextResponse("Sign in required", { status: 401 });
  const r = getReport(report);
  if (!r) return new NextResponse("Unknown report", { status: 404 });
  if (!can(u.role, r.perm) || !can(u.role, "report.export")) return new NextResponse("Your role cannot export this report", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const filters = { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, institution: sp.get("institution") ?? undefined, status: sp.get("status") ?? undefined };
  const rows = await r.run(u, filters);
  const body = rows.map((row) => r.columns.map((c) => row[c.key]));
  const total = totalOf(rows, r.totalKey);
  if (total) body.push(r.columns.map((c, i) => (i === 0 ? "TOTAL" : c.key === r.totalKey ? total : "")));
  const csv = "﻿" + toCsv(r.columns.map((c) => c.label), body);
  await audit(toActor(u), "report.exported", "report", r.key, r.title, { rows: rows.length, filters });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="depositflow-${r.key}-${todayISO()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
