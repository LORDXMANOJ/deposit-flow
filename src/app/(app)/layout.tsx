import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { AppShell } from "@/components/shell";
import { clockOffsetDays, todayISO } from "@/lib/maturity";
import { fmtDate } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const inst = u.institutionId ? await one<{ name: string }>("select name from institutions where id=$1", [u.institutionId]) : null;
  const offset = clockOffsetDays();
  return (
    <AppShell
      user={{ id: u.id, name: u.name, email: u.email, role: u.role, institutionName: inst?.name ?? null }}
      clock={offset ? { offset, today: fmtDate(todayISO()) } : null}
    >
      {children}
    </AppShell>
  );
}
