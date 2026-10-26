import { Check, Circle, X, ExternalLink } from "lucide-react";

type Step = { title: string; state: "done" | "current" | "blocked" | "todo" | "external"; detail: string };

/**
 * Four separate events that are easy to blur together:
 * requested, decided, recorded in DepositFlow, and the money/FDR actually released by the bank.
 * The last one never happens inside this app, and the stepper says so.
 */
export function ReleaseStepper(props: {
  status: string; requester: string | null; createdAt: string; reviewer: string | null; decidedAt: string | null; comments: string | null;
  processor: string | null; processedAt: string | null; outcomeRef: string | null; outcomeMode: string | null; when: (iso: string | null) => string;
}) {
  const s = props.status;
  const decided = ["approved", "rejected", "released"].includes(s);
  const steps: Step[] = [
    { title: "Release requested", state: "done", detail: `${props.requester ?? "Institution"} on ${props.when(props.createdAt)}` },
    {
      title: s === "rejected" ? "Rejected" : s === "info_requested" ? "Information requested" : "Approved by the competent authority",
      state: s === "rejected" ? "blocked" : decided ? "done" : "current",
      detail: decided || s === "info_requested"
        ? `${props.reviewer ?? "Reviewer"}${props.decidedAt ? ` on ${props.when(props.decidedAt)}` : ""}${props.comments ? `: "${props.comments}"` : ""}`
        : s === "under_review" ? "Under review" : "Waiting for a reviewer",
    },
    {
      title: "Release recorded in DepositFlow",
      state: s === "released" ? "done" : s === "approved" ? "current" : s === "rejected" ? "blocked" : "todo",
      detail: s === "released"
        ? `${props.processor ?? "Officer"} on ${props.when(props.processedAt)}. ${props.outcomeMode === "simulated" ? `Simulated outcome ${props.outcomeRef}.` : `Reference ${props.outcomeRef} entered by the officer.`}`
        : s === "approved" ? "An authorized officer records the outcome." : "Only after approval.",
    },
    {
      title: "Funds or FDR released by the bank",
      state: "external",
      detail: props.outcomeMode === "manual_confirmation"
        ? `Happens outside DepositFlow. The officer recorded bank reference ${props.outcomeRef}; DepositFlow did not verify it with the bank.`
        : "Happens outside DepositFlow. This app never moves money and has no bank connection; it keeps the authorized record of the process.",
    },
  ];
  const icon = (st: Step["state"]) =>
    st === "done" ? <Check size={14} /> : st === "blocked" ? <X size={14} /> : st === "external" ? <ExternalLink size={13} /> : <Circle size={9} fill="currentColor" />;
  const tone = (st: Step["state"]) =>
    st === "done" ? "bg-[var(--ok-dot)] text-white" : st === "blocked" ? "bg-[var(--bad-dot)] text-white" : st === "current" ? "bg-[var(--accent)] text-white"
      : st === "external" ? "bg-[var(--surface)] text-ink-3 border border-dashed border-[var(--line-strong)]" : "bg-[var(--sunken)] text-ink-3";

  return (
    <ol className="card grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[var(--line)]" aria-label="Release progress">
      {steps.map((st, i) => (
        <li key={st.title} className={`p-4 ${st.state === "external" ? "bg-[var(--surface-2)]" : ""}`} aria-current={st.state === "current" ? "step" : undefined}>
          <div className="flex items-center gap-2">
            <span className={`grid place-items-center w-6 h-6 rounded-full shrink-0 ${tone(st.state)}`} aria-hidden>{icon(st.state)}</span>
            <span className="text-[0.7rem] text-ink-3">{st.state === "external" ? "Outside this system" : `Step ${i + 1}`}</span>
          </div>
          <p className={`mt-2 text-[0.88rem] font-semibold ${st.state === "todo" ? "text-ink-3" : ""}`}>{st.title}</p>
          <p className="mt-1 text-[0.78rem] text-ink-2 leading-snug">{st.detail}</p>
        </li>
      ))}
    </ol>
  );
}
