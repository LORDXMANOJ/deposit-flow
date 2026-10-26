import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { isScoped } from "@/lib/rbac";
import { todayISO } from "@/lib/maturity";
import { PageHeader } from "@/components/ui";
import { DepositForm } from "@/components/deposit-form";

export const metadata = { title: "New deposit" };

export default async function NewDeposit({ searchParams }: { searchParams: Promise<{ institution?: string }> }) {
  const u = await requireUser("deposit.write");
  const sp = await searchParams;
  const institutions = isScoped(u.role)
    ? await q<{ id: string; name: string }>("select id, name from institutions where id=$1", [u.institutionId])
    : await q<{ id: string; name: string }>("select id, name from institutions where status='active' order by name");
  return (
    <div>
      <PageHeader title="New security deposit" description="Creates the deposit as a draft. Uploading the FDR receipt sends it for verification." />
      <DepositForm institutions={institutions} defaultInstitution={sp.institution} today={todayISO()} />
    </div>
  );
}
