# DepositFlow: app summary

Source material for the presentation. Screenshots are in `docs/screenshots/` and listed at the end.

## The problem

AICTE and the institutions it works with hold security deposits as fixed deposit receipts (FDRs). Today these are tracked in spreadsheets and by email. Maturity dates get missed, nobody can see which receipts were actually checked, and when a deposit is released there is no single record of who decided what.

## What DepositFlow does

It keeps every deposit and FDR in one register and follows each one from receipt to release.

- Register a deposit and its FDR once. Amounts are exact decimals, never floating point.
- Upload the bank receipt. The file type is read from the file's bytes, it is stored privately, and it can only be opened through a link that expires.
- A verification officer reviews the receipt next to the register. If the amount or date on the document differs from the register, the app flags it.
- A rule engine checks every FDR against today's date and raises alerts at 30, 15, 7 and 0 days before maturity, and after maturity if nothing has happened. Running it twice never creates a duplicate.
- Renewal creates a new FDR linked to the old one. Nothing is overwritten.
- Release moves through request, review, approval and a recorded outcome. The person who asked cannot approve their own request.
- Every action is written to an audit trail that the database itself refuses to edit or delete.

## Who uses it

| Role | What they can do |
|---|---|
| Administrator | Everything, plus users, roles, settings and demo reset |
| Institution User | Their own institution only: deposits, FDRs, uploads, release requests |
| Verification Officer | Review documents: approve, reject, request changes |
| Finance / Authorized Officer | Review and decide release requests, record the outcome |
| Auditor | Read-only access to records, reports and the audit trail |

Permissions are checked on the server for every action. Hiding a button is only for convenience.

## Screens

- Landing page: what the product does, how it works, what is real and what is simulated, then a role picker.
- Overview: a blue "Today" band (FDRs maturing in 7 days, matured with no next step, documents waiting, open alerts), headline totals, a maturity watchlist, an attention list, a verification queue, four charts and recent activity.
- Institutions, Security deposits and FDR register: searchable, filterable, sortable lists with detail pages and full history.
- Maturity calendar: a month grid coloured by urgency, plus a list view with the next action for each FDR.
- Document verification: a queue on the left, the document preview, the register-vs-document comparison and the decision on the right.
- Release and refund: requests by status, the workflow history and only the actions the current role may take.
- Alerts: severity counts, filters, acknowledge and resolve with undo, and each alert's history.
- Reports: seven reports with filters, totals, CSV export and a print view.
- Audit trail, users and roles (with a permission matrix), and settings.

## Numbers from the demo data

14 fictional institutions, 28 deposits and FDRs worth ₹12.18 crore, six demo users. One run of the alert engine finds 23 conditions across 7 rules. The seed always includes FDRs maturing today, tomorrow, in exactly 7 days, in 8 days and in 31 days, so the reminders can be shown on any day.

## How it is built

Next.js 16 with React 19 and TypeScript. Postgres through PGlite, so the demo runs with one command and no database server; the same SQL schema runs on Supabase. Tailwind CSS, Recharts, Zod and React Hook Form. 53 automated tests, plus the full demo flow run end to end in a real browser.

## Design

A calm, light interface with one brand colour (cobalt) used for actions, navigation and the "Today" band. Status colours carry meaning: green verified, amber due soon, red overdue. Figures use a monospaced face so columns line up. Pages fade in on navigation, sections rise into view on scroll, numbers count up, and all of it switches off for people who ask their device for reduced motion. Dark mode, phone layouts, a Ctrl+K command menu and keyboard shortcuts are included. The logo is a "D" drawn from three register rows, the last one in cobalt.

## Honest limits

Fund release is recorded, never executed. FDR authenticity is not checked with a bank. There is no email or SMS, no background scheduler (checks run on demand) and no OCR. Sign-in is a demo role picker. The statuses and approval steps are demonstration logic and need confirmation from AICTE.

## Screenshot index

| File | Shows |
|---|---|
| 01-landing-hero.png | Landing page, first screen |
| 01b-landing-flow.png | "From receipt to release" steps |
| 01c-landing-maturity.png | Maturity section with calendar shot |
| 01d-landing-verify.png | Verification and audit section, real vs simulated |
| 01e-landing-roles.png | Role picker |
| 02-dashboard.png | Overview with the Today band |
| 02b-dashboard-charts.png | Charts and recent activity |
| 03-institutions.png | Institutions list |
| 04-institution-profile.png | Institution profile |
| 05-deposits.png | Security deposits register |
| 06-new-deposit.png | New deposit form with linked FDR |
| 07-fdr-register.png | FDR register with computed bands |
| 08-fdr-detail.png | FDR detail: maturity, receipt versions, reviews |
| 09-calendar.png | Maturity calendar, month view |
| 10-calendar-list.png | Maturity calendar, list view |
| 11-verification.png | Document verification workspace |
| 12-releases.png | Release request after a simulated outcome |
| 13-alerts.png | Alerts after running the checks |
| 14-reports.png | Reports |
| 15-audit.png | Audit trail after the demo flow |
| 16-users.png | Users, roles and permission matrix |
| 17-settings.png | Settings and alert rules |
| 18-mobile-landing.png, 18-mobile-dashboard.png | Phone layouts |
| 19-mobile-notifications-sheet.png | Swipe-to-dismiss notifications sheet |
| 20-mobile-nav.png | Phone navigation drawer |
