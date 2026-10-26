import Image from "next/image";
import { redirect } from "next/navigation";
import { ShieldCheck, Building2, BadgeIndianRupee, Eye, UserCog, ArrowRight, Check, FlaskConical } from "lucide-react";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { signInAsDemo } from "@/app/actions/auth";
import { LogoMark } from "@/components/logo";
import { formatINRCompact } from "@/lib/money";

export const metadata = { title: { absolute: "DepositFlow, Security Deposit and FDR register" } };

const ROLE_ICON: Record<Role, typeof ShieldCheck> = { admin: UserCog, institution: Building2, verifier: ShieldCheck, finance: BadgeIndianRupee, auditor: Eye };
const ROLE_BLURB: Record<Role, string> = {
  admin: "Users, roles, settings and every record",
  institution: "Submit deposits, FDRs, documents and requests",
  verifier: "Approve, reject or return documents",
  finance: "Decide and process release requests",
  auditor: "Read-only records, reports and audit trail",
};

const FLOW = [
  ["Register", "Record the deposit and its FDR once. Amounts are stored as exact decimals."],
  ["Upload", "Attach the bank receipt. The file type is checked from its bytes and stored privately."],
  ["Verify", "An officer approves, rejects or sends it back. Every decision is kept with its reason."],
  ["Remind", "Rules raise alerts at 30, 15, 7 and 0 days, never twice for the same threshold."],
  ["Release", "Renewal or release moves through review and a recorded outcome. History is never overwritten."],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect("/");
  const sp = await searchParams;
  const users = await q<{ id: string; full_name: string; role: Role; inst: string | null }>(
    `select p.id, p.full_name, p.role, i.name as inst from profiles p left join institutions i on i.id = p.institution_id
     where p.is_demo and p.active order by array_position(array['admin','institution','verifier','finance','auditor'], p.role), p.full_name`);
  const [stats] = await q<{ fdrs: number; value: string; insts: number }>(
    `select (select count(*)::int from fdr_records where lifecycle_status in ('active','matured')) as fdrs,
            (select coalesce(sum(principal),0)::numeric(16,2)::text from fdr_records where lifecycle_status in ('active','matured')) as value,
            (select count(*)::int from institutions) as insts`);

  return (
    <div className="bg-[var(--canvas)] min-h-dvh">
      <header className="sticky top-0 z-40 glass-bar border-b border-[color-mix(in_srgb,var(--line)_70%,transparent)] safe-top">
        <div className="max-w-[1180px] mx-auto safe-x h-14 flex items-center justify-between">
          <span className="flex items-center gap-2"><LogoMark size={22} /><span className="font-semibold tracking-[-0.02em]">DepositFlow</span></span>
          <a href="#roles" className="btn btn-primary btn-sm">Open the demo</a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-[1180px] mx-auto safe-x pt-16 md:pt-24">
          <div className="max-w-[820px] route-enter">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-[0.8rem] font-semibold tracking-wide uppercase">
              AICTE Regulation Bureau • PS26265
            </div>
            <h1 className="text-[2.6rem] md:text-[4rem] leading-[1.04] font-semibold tracking-[-0.04em]">
              Every security deposit, <span className="text-[var(--accent)]">accounted for.</span>
            </h1>
            <p className="mt-5 text-[1.1rem] md:text-[1.25rem] text-ink-2 max-w-[54ch] leading-relaxed">
              AICTE Regulation Bureau • Security Deposit & FDR Management Portal (PS26265). One centralized digital register for institutional deposits, with automated maturity alerts, dual-pane verification and audit-ready release governance.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#roles" className="btn btn-primary !h-11 !px-5 !text-[0.95rem]">Explore the live demo <ArrowRight size={16} /></a>
              <a href="#how" className="btn btn-secondary !h-11 !px-5 !text-[0.95rem]">See how it works</a>
            </div>
          </div>
          <div className="hero-shot mt-14 md:mt-20 rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-[0_40px_80px_-40px_rgb(26_60_196/0.45),0_10px_30px_-12px_rgb(18_26_46/0.18)]">
            <Image src="/shots/dashboard.png" alt="DepositFlow overview: today's maturities, alerts and the maturity watchlist" width={1440} height={900} priority className="w-full h-auto" />
          </div>
        </section>

        {/* Live numbers, quiet strip */}
        <section className="max-w-[1180px] mx-auto safe-x mt-16 reveal">
          <dl className="grid grid-cols-3 border-y border-[var(--line)] divide-x divide-[var(--line)]">
            {[["Institutions", String(stats.insts)], ["FDRs being tracked", String(stats.fdrs)], ["Principal on the register", formatINRCompact(stats.value)]].map(([k, v]) => (
              <div key={k} className="py-6 px-4 md:px-8 text-center"><dd className="figure text-[1.6rem] md:text-[2.2rem]">{v}</dd><dt className="text-[0.8rem] text-ink-3 mt-1">{k}</dt></div>
            ))}
          </dl>
          <p className="text-center text-[0.76rem] text-ink-3 mt-3">Live from the demo database. All records are synthetic.</p>
        </section>

        {/* How it works: verbs, not step numbers */}
        <section id="how" className="max-w-[1180px] mx-auto safe-x mt-28 scroll-mt-20">
          <h2 className="text-[2rem] md:text-[2.8rem] leading-[1.08] font-semibold tracking-[-0.035em] max-w-[18ch] reveal">From receipt to release, in one place.</h2>
          <ol className="mt-12 grid md:grid-cols-5 gap-px bg-[var(--line)] border border-[var(--line)] rounded-xl overflow-hidden">
            {FLOW.map(([verb, body], i) => (
              <li key={verb} className="reveal bg-[var(--surface)] p-6 flex flex-col gap-3" style={{ animationRangeStart: `entry ${i * 4}%` }}>
                <span className={`text-[1.3rem] font-semibold tracking-[-0.02em] ${i === 3 ? "text-[var(--accent)]" : ""}`}>{verb}</span>
                <p className="text-[0.88rem] text-ink-2 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Maturity: split */}
        <section className="max-w-[1180px] mx-auto safe-x mt-28 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div className="reveal">
            <h2 className="text-[2rem] md:text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.035em]">Maturity dates stop being a spreadsheet column.</h2>
            <p className="mt-4 text-[1.05rem] text-ink-2 leading-relaxed max-w-[44ch]">
              Status is computed from today&apos;s date and the FDR&apos;s state, not typed by hand. The calendar shows what matures and what to do next, and one click opens the record.
            </p>
            <ul className="mt-6 space-y-2.5 text-[0.95rem]">
              {["Configurable thresholds, 30, 15, 7 and 0 days by default", "Renewal creates a new FDR and keeps the old one", "Overdue items escalate to an administrator"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="reveal rounded-xl overflow-hidden border border-[var(--line)] shadow-[0_30px_60px_-30px_rgb(18_26_46/0.35)]">
            <Image src="/shots/calendar.png" alt="Maturity calendar with FDRs coloured by urgency" width={1440} height={900} className="w-full h-auto" />
          </div>
        </section>

        {/* Verification + audit: asymmetric pair on a tinted band */}
        <section className="mt-28 bg-[var(--sunken)] py-24">
          <div className="max-w-[1180px] mx-auto safe-x grid lg:grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="reveal rounded-xl bg-[var(--surface)] border border-[var(--line)] overflow-hidden flex flex-col">
              <div className="p-8 pb-6">
                <h3 className="text-[1.6rem] font-semibold tracking-[-0.03em]">Uploaded is not verified.</h3>
                <p className="mt-2 text-ink-2 max-w-[52ch]">Officers see the receipt next to the register. If the amount or date on the document differs, the app says so before anyone approves.</p>
              </div>
              <Image src="/shots/verification.png" alt="Verification workspace comparing register values with the document" width={1440} height={900} className="w-full h-auto border-t border-[var(--line)]" />
            </div>
            <div className="reveal hero-band rounded-xl text-[var(--hero-ink)] p-8 flex flex-col justify-between gap-10">
              <div>
                <h3 className="text-[1.6rem] font-semibold tracking-[-0.03em]">Nothing is quietly edited.</h3>
                <p className="mt-2 text-[var(--hero-ink-2)]">The audit trail is append-only at the database level. Even the application cannot update or delete an entry.</p>
              </div>
              <ul className="space-y-2 text-[0.9rem] text-[var(--hero-ink-2)]">
                {["Who did it", "What changed", "When, to the second", "From which role"].map((t) => <li key={t} className="flex items-center gap-2 border-t border-[var(--hero-line)] pt-2"><Check size={15} className="text-white" />{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Honesty */}
        <section className="max-w-[1180px] mx-auto safe-x mt-28">
          <h2 className="text-[2rem] md:text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.035em] reveal">What is real, and what is simulated.</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-10 reveal">
            <div>
              <p className="font-semibold mb-3">Working in this prototype</p>
              <ul className="space-y-2 text-[0.92rem] text-ink-2">
                {["Database persistence, migrations and seed data", "Role permissions checked on the server for every action", "Alert rules with duplicate prevention", "Private document storage with expiring signed links", "CSV exports that follow the same permissions"].map((t) => <li key={t} className="flex gap-2"><Check size={16} className="text-[var(--ok-dot)] shrink-0 mt-0.5" />{t}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-3">Simulated or not included</p>
              <ul className="space-y-2 text-[0.92rem] text-ink-2">
                {["Fund release is recorded, never executed", "No bank verification of FDR authenticity", "No email or SMS; notifications are in-app", "No background scheduler; checks run on demand", "Statuses and approval steps are not official AICTE rules"].map((t) => <li key={t} className="flex gap-2"><FlaskConical size={16} className="text-[var(--violet-dot)] shrink-0 mt-0.5" />{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Role picker */}
        <section id="roles" className="max-w-[1180px] mx-auto safe-x mt-28 pb-24 scroll-mt-20">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
            <div className="reveal">
              <h2 className="text-[2rem] md:text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.035em]">Pick a role and look around.</h2>
              <p className="mt-4 text-ink-2 max-w-[42ch]">Each role sees different records and actions. Demo sign-in has no passwords and is not production authentication.</p>
              {sp.error && <p role="alert" className="mt-4 text-sm text-[var(--bad-ink)]">{sp.error === "disabled" ? "Demo sign-in is turned off on this server (DEMO_ROLE_PICKER=off)." : "That demo account is unavailable. Choose another."}</p>}
            </div>
            <ul className="reveal card divide-y divide-[var(--line)] overflow-hidden">
              {users.map((u) => {
                const Icon = ROLE_ICON[u.role];
                return (
                  <li key={u.id}>
                    <form action={signInAsDemo}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <button className="group w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--accent-soft)] transition-colors">
                        <span className="grid place-items-center w-10 h-10 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition-colors shrink-0" aria-hidden><Icon size={18} strokeWidth={1.75} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{ROLE_LABEL[u.role]}</span>
                          <span className="block text-[0.8rem] text-ink-3 truncate">{u.inst ?? ROLE_BLURB[u.role]}</span>
                        </span>
                        <span className="hidden sm:block text-[0.78rem] text-ink-3 truncate max-w-[150px]">{u.full_name.replace(" (demo)", "")}</span>
                        <ArrowRight size={16} className="text-ink-3 group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--line)]">
        <div className="max-w-[1180px] mx-auto safe-x py-8 flex flex-wrap items-center justify-between gap-3 text-[0.8rem] text-ink-3">
          <span className="flex items-center gap-2"><LogoMark size={16} /> DepositFlow, a prototype for SIH26265</span>
          <span>Not an official AICTE system. All data is synthetic.</span>
        </div>
      </footer>
    </div>
  );
}
