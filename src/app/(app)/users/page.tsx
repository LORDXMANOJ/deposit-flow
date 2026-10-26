import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { ROLE_LABEL, ROLES, can, type Role, type Permission } from "@/lib/rbac";
import { PageHeader, Panel } from "@/components/ui";
import { UserRow, NewUser } from "@/components/user-admin";
import { Check, Minus } from "lucide-react";

export const metadata = { title: "User & Role Management" };

const MATRIX_ROWS: Array<[string, Permission]> = [
  ["View records", "deposit.read"], ["Create deposits and FDRs", "deposit.write"], ["Upload documents", "document.upload"],
  ["Review documents", "document.review"], ["Request release", "release.create"], ["Decide release", "release.review"],
  ["Record release outcome", "release.process"], ["Run alert checks", "alert.run"], ["Export reports", "report.export"],
  ["View audit trail", "audit.read"], ["Manage users", "user.manage"], ["Change settings", "settings.manage"],
];

export default async function UsersPage() {
  const me = await requireUser("user.manage");
  const [users, institutions] = await Promise.all([
    q<{ id: string; full_name: string; email: string; role: Role; institution_id: string | null; active: boolean; is_demo: boolean }>(
      "select id, full_name, email, role, institution_id, active, is_demo from profiles order by array_position(array['admin','institution','verifier','finance','auditor'], role), full_name"),
    q<{ id: string; name: string }>("select id, name from institutions order by name"),
  ]);
  return (
    <div>
      <PageHeader title="Users and roles" description="Roles are demonstration logic and configurable. Permissions are enforced in server actions, not by hiding buttons." actions={<NewUser institutions={institutions} />} />
      <div className="card mb-8">
        <div className="table-wrap"><table className="dtable">
          <thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Access</th><th><span className="sr-only">Save</span></th></tr></thead>
          <tbody>{users.map((x) => (
            <tr key={x.id}>
              <td><span className="block font-medium">{x.full_name}{x.id === me.id && <span className="ml-2 badge badge-info">You</span>}</span><span className="text-[0.74rem] text-ink-3">{x.email}</span></td>
              <UserRow user={x} institutions={institutions} self={x.id === me.id} />
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <Panel title="Permission matrix" description="What each role can do">
        <div className="table-wrap"><table className="dtable">
          <thead><tr><th>Capability</th>{ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r].split(" (")[0].replace(" / Authorized Officer", "")}</th>)}</tr></thead>
          <tbody>{MATRIX_ROWS.map(([label, perm]) => (
            <tr key={perm}><td>{label}</td>{ROLES.map((r) => (
              <td key={r} className="text-center">{can(r, perm) ? <Check size={15} className="inline text-[var(--ok-dot)]" aria-label="Allowed" /> : <Minus size={15} className="inline text-[var(--line-strong)]" aria-label="Not allowed" />}</td>
            ))}</tr>
          ))}</tbody>
        </table></div>
      </Panel>
    </div>
  );
}
