import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { runChecks } from "@/lib/alert-engine";
import { recordRun } from "@/lib/scheduler";
import { loadClock } from "@/lib/clock";

/**
 * Entry point for a hosted scheduler (Vercel Cron, GitHub Actions, cron + curl). Requires
 * `Authorization: Bearer <CRON_SECRET>`; without a configured secret the endpoint stays closed.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 16 && got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await loadClock();
  const s = await runChecks({ id: null, name: "Scheduled job (cron)", role: "system" });
  await recordRun({ at: s.ranAt, trigger: "cron", created: s.created, candidates: s.candidates, autoResolved: s.autoResolved, escalated: s.escalated });
  return NextResponse.json({ ok: true, summary: s });
}

export const GET = handle;
export const POST = handle;
