import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export async function GET() {
  const u = await getUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await q(
    `select n.id, n.title, n.body, n.link, n.read_at, n.created_at, a.severity
     from notification_events n left join alerts a on a.id = n.alert_id
     where n.user_id = $1 order by n.created_at desc limit 30`, [u.id]);
  const [{ unread }] = await q<{ unread: number }>("select count(*)::int as unread from notification_events where user_id=$1 and read_at is null", [u.id]);
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "private, no-store" } });
}
