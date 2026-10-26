# MASTER PROMPT V2: SIH26265 DepositFlow (AICTE Security Deposit / FDR Portal)

You are a senior full-stack engineer, enterprise architect and product designer. Build **DepositFlow**, a working, polished web application for Smart India Hackathon 2026, problem statement **SIH26265 "Streamline of Security Deposit / FDR Portal"** (AICTE, Software, Smart Automation).

This is a hackathon prototype. Do not invent AICTE policies, legal rules, interest rates or mandatory procedures. Label every configurable workflow as demonstration logic. Never claim an integration (bank, email, OCR, fund transfer) works unless it is really built and tested; label simulated steps as "Simulated".

Work inside `c:\final saint gobain`. Inspect the folder first. If it is empty, scaffold; if it has work, preserve and extend it. Do not stop at a plan or a frontend shell. Keep going until the main workflows run end to end.

---

## PART A: SKILLS TO USE (invoke with the Skill tool at the stated moment)

Load each skill before the work it covers. Follow its guidance over generic habits.

**Planning and process**
1. `writing-plans`, then `executing-plans`: write a short phased plan first (Phase 1 to 6 below) and execute it phase by phase.
2. `brainstorming`: once, to settle product and design direction before building.
3. `systematic-debugging`: for every bug or failing test, find root cause before patching.
4. `verification-before-completion`: before saying anything is done, run the commands and show evidence.

**Scaffold and frontend engineering**
5. `scaffold-nextjs`, `nextjs`, `nextjs-developer`: project setup and App Router structure (server components, server actions, route handlers, loading/error boundaries).
6. `react`, `react-expert`, `typescript`, `typescript-pro`, `vercel-react-best-practices`: component architecture, strict typing, performance.
7. `tailwindcss` (or `tailwind`) and `shadcn`: styling system and accessible component primitives.
8. `react-hook-form`, `zod`, `zod-schema-validation`: forms and shared client/server validation.
9. `tanstack-query` only if client-side caching is genuinely needed.

**UI / UX design (this is the priority for look and feel)**
10. `ui-ux-pro-max:ui-ux-pro-max` and `ui-ux-pro-max:design-system`: choose the visual system (palette, type pairing, spacing scale, radius, shadows) and write it down as design tokens before building screens.
11. `impeccable`: design, critique, polish, harden and adapt the interface. Run it on the app shell, dashboard and every data table.
12. `frontend-design`, `design-taste-frontend`, `interface-design`, `product-design`: avoid templated AI-looking UI; make deliberate choices.
13. `redesign-existing-projects`: after the first working pass, audit the UI for generic patterns and upgrade it.
14. `make-interfaces-feel-better`, `emil-design-eng`, `apple-design`, `typography-audit`: micro-details (hover/focus/pressed states, optical alignment, number tabular-figures, tidy tables, restrained motion).
15. `dataviz` and `data:build-dashboard`: all charts and KPI tiles. Use the dataviz color rules, accessible palettes, and consistent light/dark behavior.
16. `accessibility` and `web-design-guidelines`: WCAG 2.2 AA audit (contrast, keyboard navigation, focus rings, labels, aria, reduced motion).
17. `framer-motion` or `ui-animation`/`animate`: only subtle, purposeful motion (page transitions under 200 ms, sheet/dialog entrances). Respect `prefers-reduced-motion`.

**Backend, database, security**
18. `supabase`, `supabase-postgres-best-practices`, `postgres-pro`, `sql-pro`: schema, migrations, RLS policies, Storage with signed URLs, Auth. Use `@supabase/ssr`.
19. `secure-code-guardian`, `security-and-hardening`, `security-reviewer`, `jwt-security`: server-side authorization on every action, upload validation by magic bytes, no secrets in client code, append-only audit log.
20. `api-designer`: consistent route/action contracts and error shapes.
21. `fullstack-guardian`: cross-check that UI, API and database rules agree.

**Testing and verification**
22. `test-driven-development`, `vitest`: write failing tests first for maturity thresholds, duplicate-alert prevention, authorization and validation.
23. `playwright` / `playwright-expert`: end-to-end demo flow test.
24. `browser-automation`, `ui-verification`, `webapp-testing`: actually load the running app, check console errors, network failures, and look at screenshots at 1440, 768 and 390 px widths. Fix what you see.
25. `code-reviewer` and `simplify`: final review pass.

**Docs**
26. `readme-best-practices`: README, setup, demo walkthrough, feature checklist.

If a skill is unavailable, say so in one line and continue with equivalent judgment. Do not spend time reading skills that do not apply to the current step.

---

## PART B: UI / UX STANDARD (non-negotiable)

Goal: it should look like a real government-grade fintech console that a judge would believe is in production. Not a template, not a landing-page demo.

**Design system first.** Before screens, produce `docs/design-system.md` and matching Tailwind tokens (CSS variables) for:
- Color: deep navy/slate sidebar (#0F1B33 range), neutral cool-gray canvas, one blue primary, semantic green/amber/red/violet/slate for statuses. Each semantic color has a bg, border, text and dot variant that passes AA contrast. Full dark-mode token set.
- Type: one sans family (e.g. Inter or Geist) plus a mono for IDs, FDR numbers and amounts. Define a scale (12/13/14/16/20/24/30). Body 14px in tables. Use `font-variant-numeric: tabular-nums` for every amount and date column.
- Spacing on a 4px grid, radius 6/8/12, subtle layered shadows, 1px borders instead of heavy boxes.
- Indian formatting: amounts as ₹ with lakh/crore grouping (`en-IN`), compact form on KPI tiles (e.g. ₹12.4 Cr) with exact value on hover; dates as `DD MMM YYYY`.

**App shell.** Collapsible sidebar (icons only when collapsed, tooltips), grouped nav sections, active-state indicator, sticky top bar with breadcrumbs, global command-palette search (Ctrl/Cmd+K), notification popover with unread count, user menu with role badge, theme toggle, a visible **"Demo mode, synthetic data"** ribbon. Mobile: off-canvas drawer, bottom-safe tap targets (44px), tables convert to stacked cards or horizontally scroll with a sticky first column.

**Data-dense screens.**
- Tables: sticky header, column sort, column visibility, row hover, bulk select, inline status badges, row actions menu, server pagination, saved filter chips, empty/loading (skeleton, not spinner)/error states with a retry.
- Detail pages: header with title + status + primary actions, left content, right rail with timeline/history, tabs for Overview, Documents, History, Alerts.
- Forms: sectioned, inline validation messages, helper text, unsaved-changes guard, amount input with ₹ prefix and lakh formatting, date pickers with min/max rules.
- Dialogs: confirmation dialogs for destructive and financial actions, stating exactly what will happen. Toasts for results, never as the only record of an action.
- Status badges: icon + text + color (never color alone).

**Dashboard.** Six KPI tiles with delta/context line, four charts (status donut or stacked bar, maturities by month bar, verification workload, institution distribution), then action panels (upcoming maturities, pending verification queue, overdue requests, critical alerts, recent audit events). One strong visual hierarchy: the "needs action today" area is most prominent. Charts must have titles that state the takeaway, readable axes, tooltips, legends and text alternatives.

**Maturity calendar.** Real month grid with colored event chips (green > 30 days, amber 8 to 30, orange 1 to 7, red due today/overdue), day overflow "+3 more", month/list toggle, click opens FDR detail.

**Polish checklist** (verify with screenshots, fix until all pass):
- Consistent alignment and spacing, no orphaned borders, no text overflow or truncation without tooltip.
- Visible keyboard focus on everything; full tab order; Esc closes overlays.
- No layout shift on load; skeletons match final layout.
- Light and dark both look intentional.
- No console errors or warnings; no horizontal page scroll at 390 px.
- Lighthouse accessibility >= 95 on the dashboard and one table page.

Avoid: purple-blue gradient heroes, oversized headings, emoji as icons, glassmorphism everywhere, placeholder lorem text, stock "Welcome to..." copy, inconsistent icon sizes. Use Lucide icons at one size per context.

---

## PART C: FUNCTIONAL REQUIREMENTS

### Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Lucide + Recharts + Zod + React Hook Form. Backend via server actions/route handlers. Database PostgreSQL on Supabase with Auth, Storage, RLS. Tests with Vitest and Playwright. Deploy target Vercel + Supabase.

**Offline-capable demo mode:** if Supabase credentials are absent, run a fully working local mode with persistent storage (local Postgres via Docker/PGlite or SQLite) so the demo works with zero setup. Never expose service-role keys to the browser. Provide `.env.example` with placeholders only.
Note: the Supabase MCP connector is not authorized in this environment; use the Supabase CLI and SQL migration files, not the MCP.

### Navigation (12 modules)
Overview, Institutions, Security Deposits, FDR Register, Maturity Calendar, Document Verification, Release / Refund Requests, Alerts & Notifications, Reports & Analytics, Audit Trail, User & Role Management, Settings.

### Modules
1. **Dashboard**: KPIs computed from DB (institutions, active deposits, recorded value, FDRs maturing in 30 days, documents awaiting verification, overdue requests); four charts; action panels; filters (date range, institution, status, deposit type).
2. **Institutions**: full CRUD, ID, name, category, AICTE-related identifier (if applicable), state/district, authorized contact, email/phone, status, timestamps; search, filter, pagination, profile page with deposit/verification history; block deletion when linked to active financial records. Synthetic data only.
3. **Security deposits**: ID, institution, type, principal (NUMERIC), deposit date, bank, FDR number, linked document, status, verification status, maturity date, renewal status, release status, notes, timestamps. Configurable statuses (Draft, Submitted, Under Review, Verified, Action Required, Maturing Soon, Matured, Release Requested, Released, Rejected). Create/edit/view, status history, validation, CSV export. Decimal-safe money handling (no float arithmetic).
4. **FDR register and maturity engine**: FDR id, institution, deposit, bank, principal, issue and maturity date, renewal instruction status, doc verification status, lifecycle status, last notification date, remarks. Configurable thresholds (default 30/15/7/0 days and post-maturity). Status is **computed** from today's date plus record state. No duplicate reminder per FDR + threshold unless an authorized user retries/resets. Renewal workflow (pending, initiated, new FDR submitted, document under review, verified, rejected/action required) creates a **new** FDR and keeps the old one and its history.
5. **Maturity calendar**: month grid + list view; click opens FDR.
6. **Document management and verification**: upload PDF/JPEG/PNG (configurable allowlist and size limit), server-side magic-byte check, safe generated storage names, private bucket, authorization-checked signed URLs, version history, link to institution/deposit/uploader/date, reviewer decisions (Approve / Reject / Request changes) with remarks, all audited. Upload is not verification. Label checks "manual review" or "simulated". Optional: OCR-assisted extraction, shown as **unverified** until a human confirms.
7. **Release / refund requests**: create, validate required docs, review queue, approve/reject/request info, officer records outcome (simulated or manual confirmation; never claim funds moved), updates deposit lifecycle with full history. Configurable roles and transitions. Confirmation dialogs.
8. **Alert engine**: rules for approaching maturity, matured without next action, verification pending too long, missing required document, overdue release request, renewal doc rejected, FDR vs extracted-field mismatch. Alert fields: id, related record, severity, rule, created date, assignee, resolution status, action history. In-app notifications, read/ack/resolve, filters, escalation intervals, and a **"Run checks now"** button that executes real rules and writes alert rows. Idempotent (unique constraint). State the scheduler/email limitation honestly in the UI and README.
9. **RBAC**: Administrator, Institution User, Verification Officer, Finance/Authorized Officer, Auditor (read-only). Enforced on server and by RLS, not only by hiding buttons. Demo logins clearly labelled, with a one-click role switcher on the login page.
10. **Audit trail**: append-only log of creates/edits, uploads, verification decisions, transitions, release decisions, alerts, user/role changes, exports. Actor, action, entity, timestamp, change metadata. No secrets or document contents. Filterable, with diff view.
11. **Reports**: maturity forecast, deposit register, institution summary, pending verification, overdue workflow, release status, audit activity. Filters, totals, date range, CSV export, printable view (PDF if practical). Exports obey the same permissions as the data.
12. **Settings**: thresholds, file limits and types, status lists, role/transition config, escalation intervals, demo reset/reseed button (admin only).

### Database
Normalized schema with PKs/FKs, constraints, indexes, timestamps, RLS: `profiles, institutions, deposits, fdr_records, documents, document_versions, verification_reviews, release_requests, workflow_events, alert_rules, alerts, notification_events, audit_logs, system_settings`. NUMERIC for money. Versioned migrations in `supabase/migrations`, idempotent `seed.sql`/seed script producing realistic **synthetic** Indian institutions and fake FDR numbers, all flagged as demo data. Use transactions for multi-record state changes.

### Mandatory demo scenario (must be repeatable after reseed)
Open institution, create deposit + FDR, upload sample document, send for verification, reviewer approves or requests changes, open calendar, run alert engine, see maturity notification, create renewal or release request, process it through roles, inspect audit trail, export a report. Seed data must also guarantee boundary cases: FDR maturing today, tomorrow, exactly in 7 days, 31 days out.

### Tests
Auth and authorization; institution CRUD; deposit/FDR validation; threshold boundary dates (today, tomorrow, exactly 7 days, just outside threshold); duplicate alert prevention; document access control; verification transitions; release permissions; audit event creation; CSV export authorization; one Playwright run of the full demo scenario.

---

## PART D: PHASES AND ORDER

1. **Inspect + plan** (`writing-plans`): repo scan, env vars, short plan. Settle design direction (`brainstorming`, `ui-ux-pro-max:design-system`) and write `docs/design-system.md`.
2. **UI foundation**: tokens, shadcn setup, app shell, shared components (DataTable, StatusBadge, KpiTile, EmptyState, ConfirmDialog, PageHeader). Review with `impeccable`.
3. **Core**: schema, migrations, seed, auth, RBAC/RLS, institutions, deposits, FDRs.
4. **Workflow**: documents + verification, maturity/alert engine, renewal and release workflows, audit logging.
5. **Reporting + polish**: dashboard, calendar, reports, exports, empty/loading/error states. Run `redesign-existing-projects`, `make-interfaces-feel-better`, `typography-audit`, `accessibility`.
6. **Verify**: run migrations and seed, run tests, run the app and walk the demo in the browser (`browser-automation`/`ui-verification`) at 1440, 768 and 390 px, fix console errors and visual defects, `code-reviewer` pass, `verification-before-completion`.

Track progress with a to-do list. After each phase, state what works and what is not done.

---

## PART E: DEFINITION OF DONE AND DELIVERABLES

Done means: runs locally from documented commands; auth and roles work; data persists; dashboard reflects seeded data; CRUD works; documents upload and review securely; maturity maths and alerts work; renewal and release flows work; audit events recorded; reports and CSV export work; demo completes with no manual DB edits; responsive and visually consistent; no placeholder buttons; no committed secrets; tests pass (report real results).

Deliver: source code; migrations and seed; `.env.example`; README (install, setup, test, deploy); feature checklist (implemented / simulated / not implemented); test results and known limitations; 5-minute judge demo script; short architecture note; list of AICTE requirements that still need official confirmation.

Be honest in the final report. If something fails or was skipped, say so with the evidence.
