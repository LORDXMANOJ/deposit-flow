# DepositFlow

A working prototype for Smart India Hackathon 2026, problem statement SIH26265, "Streamline of Security Deposit / FDR Portal" (AICTE, Smart Automation).

DepositFlow keeps institutions' security deposits and fixed deposit receipts (FDRs) in one register. It computes maturity from today's date, raises reminders through a rule engine, routes receipts through verification, and runs release requests through review and a recorded outcome. Every change lands in an append-only audit trail.

All institutions, people, banks and FDR numbers in the demo are fictional. Statuses and approval steps are configurable demonstration logic, not official AICTE rules.

## Run it

Requirements: Node.js 22 or newer. Nothing else: the database is PGlite (Postgres compiled to WebAssembly) and is stored in `./.data`.

```bash
npm install          # an .npmrc with legacy-peer-deps=true is included
cp .env.example .env # set SESSION_SECRET to a long random string
npm run dev          # http://localhost:3000
```

The first request creates the database, runs `supabase/migrations/*.sql` and seeds the demo data. Seed dates are relative to the day you start, so the maturity demo always has FDRs due today, tomorrow, in exactly 7 days, in 8 days and in 31 days.

Production build: `npm run build && npm start`.

Reset the demo: either Settings > Reset demo data (as Administrator), or stop the server and run `npm run reset-demo`.

## Test

```bash
npm test             # 53 Vitest tests, about 10 seconds
npm run typecheck
```

The tests cover maturity bands and reminder thresholds at the boundary dates (today, tomorrow, exactly 7 days, 8 days, 31 days, past maturity), decimal-safe money, the role matrix, CSV escaping and formula-injection protection, form validation, and integration tests against a throwaway database: alert idempotency (second run creates nothing, and the database rejects a duplicate key), notifications never reaching another institution's users, the append-only audit table (also after a demo reset), idempotency keys, report scoping for institution users including a forged filter, file type sniffing, signed file links and storage path traversal.

The full demo flow was also run end to end in a real browser (Playwright) with no database edits; see "Demo walkthrough".

## Demo walkthrough (about 5 minutes)

Open the site. The landing page explains the product; "Explore the live demo" scrolls to the role picker.

1. Sign in as Institution User (Anita Rao). Open Security deposits, then New deposit. Enter a principal, a bank, an FDR number such as `DEMO-FDR-990001` and a maturity date a few days out. Create it.
2. On the deposit, open its FDR and choose Upload FDR receipt. Try a renamed non-PDF file first: it is rejected because the type is read from the file's bytes. Then upload a real PDF. Type the amount printed on it to see the mismatch check later.
3. Sign in as Verification Officer. Open Document verification. The new receipt is in the queue with a preview and a register-vs-document comparison. Approve it, or request changes with a remark.
4. Open Maturity calendar. FDRs are coloured by urgency; click one to open it.
5. Sign in as Administrator. Open Alerts and press Run checks now. The toast lists what each rule found. Press it again: no new alerts, because each alert is unique per rule, record and threshold.
6. The Overview shows the new state: the Today band, the watchlist and the notification bell.
7. Sign in as Institution User again and choose Request release on the verified deposit.
8. Sign in as Finance Officer. Open Release and refund, start review, approve, then Record outcome as Simulated. The app records SIM-REL-xxxx and says plainly that no money moved.
9. Sign in as Administrator or Auditor and open Audit trail. Every step above is there, with the actor, role and change details.
10. Open Reports, pick a report, filter it and export CSV. Institution users cannot export or see the audit trail (HTTP 403).

Other things worth showing: Ctrl+K (or ⌘K) opens the command menu, `g` then a letter jumps to a page, `[` collapses the sidebar, the moon button switches to dark mode, and on a phone notifications open as a bottom sheet you can swipe down.

## Architecture

Next.js 16 (App Router, React 19, TypeScript) with server components for pages and server actions for every write. Tailwind CSS v4 with a small token system in `src/app/globals.css`. Recharts for charts, Zod shared by forms (React Hook Form) and server actions, Lucide icons, Geist and Geist Mono fonts.

Data lives in Postgres. In demo mode that is PGlite on local disk; the schema in `supabase/migrations/0001_schema.sql` is plain Postgres, so it runs unchanged on Supabase. Money is `numeric(16,2)` and is handled as integer paise with BigInt in TypeScript, never as floating point. Multi-record changes (create deposit plus FDR, review a document and update the FDR and deposit, record a release outcome) run in one transaction.

| Area | Where |
|---|---|
| Schema, constraints, indexes, audit trigger | `supabase/migrations/0001_schema.sql` |
| Row Level Security for a Supabase deployment | `supabase/rls/policies.sql` (not applied in demo mode) |
| Role matrix and checks | `src/lib/rbac.ts`, `src/lib/auth.ts` |
| Maturity and threshold logic (pure, tested) | `src/lib/maturity.ts` |
| Alert engine | `src/lib/alert-engine.ts` |
| Server actions | `src/app/actions/*.ts` |
| Private file storage and signed links | `src/lib/storage.ts`, `src/app/api/files/[versionId]` |
| Reports and CSV export | `src/lib/reports.ts`, `src/app/api/export/[report]` |
| JSON API with Idempotency-Key | `src/app/api/v1/deposits` |
| Pages | `src/app/(app)/*`, landing and sign-in at `src/app/login` |
| Design system notes | `design-system/depositflow/MASTER.md`, logo concepts in `design-system/logo` |

Authorization is checked in every server action and route handler, not by hiding buttons. Institution users are scoped to their own institution in every query, including search, reports and exports. The audit table rejects updates and deletes with a database trigger.

## Feature checklist

Implemented and verified:

- Institutions: create, edit, archive with undo, delete only when nothing is linked, search, filter, sort, pagination, profile with deposits, FDRs, documents and history.
- Security deposits: create with an optional linked FDR in one transaction, list with filters and sort, detail with status history, notes, CSV export.
- FDR register: computed maturity bands, renewal that creates a new FDR and keeps the old one, version history of receipts, review decisions, remarks.
- Maturity calendar: month grid and list view, colour by urgency, click through to the FDR.
- Document verification: upload with content-based type checks and size limits, private storage, signed links that expire, versioning, approve, reject or request changes with remarks, register-vs-document comparison.
- Release and refund: request, review, request information, approve, reject, record outcome; requester cannot approve their own request; overdue tracking.
- Alert engine with 7 rules, deduplication by unique key, auto-resolve when a condition clears, escalation to administrators, acknowledge and resolve with undo, in-app notifications.
- Roles: Administrator, Institution User, Verification Officer, Finance Officer, Auditor.
- Audit trail: append-only, filterable, with change details.
- Reports: 7 reports with filters, totals, CSV export and a print view (browser print also saves as PDF).
- Settings: reminder thresholds, upload limit, review and release targets, per-rule switches and escalation, demo reset.
- Dark mode, responsive layouts down to 390 px wide with no horizontal scroll, keyboard navigation and shortcuts.

Simulated:

- Fund release. The app records an outcome as "simulated" or with a reference you confirmed elsewhere. It never moves money.
- Verification is a manual review. The app does not check FDR authenticity with a bank.
- Sign-in is a demo role picker without passwords.

Not implemented:

- Email or SMS notifications (in-app only).
- A background scheduler. Checks run when someone presses Run checks now; in production call `runChecks()` from a cron job.
- OCR. Values on a document are typed by the uploader and treated as unverified.
- Live Supabase wiring. The schema and RLS policies are written for it, but the app code talks to PGlite.

## Known limitations

- PGlite is a single-connection database, which is fine for a demo and a single server instance, not for horizontal scaling.
- `next build` prints one warning that file system access causes whole-project tracing. It does not affect the build output.
- In development mode, the first click on a freshly compiled page can happen before React hydrates; it works on the second click or in a production build.
- Seed data uses the server's local date; run the server in the IST time zone for dates to match Indian working days.

## Deploying

For a single server: `npm run build`, then `npm start` with `SESSION_SECRET` set and a writable `DEPOSITFLOW_DATA_DIR`. Serverless platforms such as Vercel need a real Postgres database instead of PGlite: create a Supabase project, run `supabase/migrations/0001_schema.sql` and then `supabase/rls/policies.sql`, create a private storage bucket called `documents`, and replace `src/lib/db.ts` and `src/lib/auth.ts` with Supabase clients that keep the same function signatures. That swap is not done in this prototype.

Never put `SUPABASE_SERVICE_ROLE_KEY` in client code. `.env.example` lists placeholders only.

## AICTE requirements that still need confirmation

- The official list of deposit types and the statuses AICTE uses.
- Who approves a release, in what order, and whether a second approval is required above some amount.
- Standard reminder thresholds and escalation timelines.
- Document retention periods and which documents are mandatory for each deposit type.
- Whether institutions sign in directly, and through which identity provider.
- Whether bank verification of FDRs is available through an API.
- The format of the identifiers AICTE assigns to institutions.
