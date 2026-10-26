import "server-only";
import type { PGlite } from "@electric-sql/pglite";
import { addDaysISO, todayISO } from "./maturity";
import { makeDemoPdf, saveFile, sha256 } from "./storage";
import { audit, workflowEvent } from "./audit";

/**
 * Synthetic demonstration data. Every institution, person, bank reference and FDR number is
 * fictional. Records are relative to "today" so the maturity demo works whenever it is run,
 * including the boundary cases: due today, tomorrow, exactly +7 days, +8 days, +31 days.
 */

type R = Pick<PGlite, "query">;
const sys = { id: null, name: "Seed script", role: "system" as const };

const INSTITUTIONS: Array<[string, string, string, string, string]> = [
  // name, category, state, district, contact
  ["Sahyadri Valley Institute of Engineering", "Engineering", "Karnataka", "Belagavi", "Anita Rao"],
  ["Kaveri School of Management Studies", "Management", "Tamil Nadu", "Tiruchirappalli", "Vikram Nair"],
  ["Gangetic Plains College of Pharmacy", "Pharmacy", "Uttar Pradesh", "Varanasi", "Meera Tripathi"],
  ["Aravalli Polytechnic Institute", "Polytechnic", "Rajasthan", "Udaipur", "Rohit Chauhan"],
  ["Deccan School of Architecture", "Architecture", "Telangana", "Warangal", "Sunita Reddy"],
  ["Brahmaputra Institute of Technology", "Engineering", "Assam", "Kamrup", "Pranjal Das"],
  ["Konkan Coastal Management Institute", "Management", "Maharashtra", "Ratnagiri", "Neha Kulkarni"],
  ["Malwa Institute of Engineering and Research", "Engineering", "Madhya Pradesh", "Indore", "Arjun Verma"],
  ["Nilgiri College of Pharmaceutical Sciences", "Pharmacy", "Tamil Nadu", "Coimbatore", "Lakshmi Iyer"],
  ["Thar Desert Polytechnic College", "Polytechnic", "Rajasthan", "Jodhpur", "Imran Khan"],
  ["Sundarbans Institute of Design and Planning", "Architecture", "West Bengal", "South 24 Parganas", "Debjani Sen"],
  ["Kutch Business School", "Management", "Gujarat", "Bhuj", "Hardik Patel"],
  ["Western Ghats Technical Campus", "Engineering", "Kerala", "Palakkad", "Joseph Mathew"],
  ["Doaba Institute of Technology", "Engineering", "Punjab", "Jalandhar", "Gurpreet Gill"],
];

const BANKS = ["State Bank of Demo", "Bank of Illustria", "Republic Savings Bank (Demo)", "Union Mercantile Bank (Demo)", "National Credit Bank (Demo)"];
const PRINCIPALS = ["2500000.00", "5000000.00", "1200000.00", "7500000.00", "3000000.00", "10000000.00", "1850000.50", "4200000.00"];
// maturity offsets in days from today; first ones hit the boundary cases on purpose
const OFFSETS = [0, 1, 7, 8, 15, 31, 30, 3, -4, -22, 45, 62, 90, 120, 150, 200, 260, 330, 400, 520, 25, 12, 5, 75, 180, 240, 300, 360];

export async function seedDemo(db: R): Promise<void> {
  const today = todayISO();
  const ins = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql, p as never[])).rows[0].id;

  // ----- settings
  const settings: Record<string, unknown> = {
    reminder_thresholds: [30, 15, 7, 0],
    allowed_mime: ["application/pdf", "image/jpeg", "image/png"],
    max_file_mb: 5,
    verification_pending_days: 3,
    release_sla_days: 7,
    matured_grace_days: 2,
    demo_mode: true,
  };
  for (const [k, v] of Object.entries(settings))
    await db.query("insert into system_settings (key, value) values ($1,$2)", [k, JSON.stringify(v)]);

  // ----- alert rules
  const rules: Array<[string, string, string, string, string, string, number]> = [
    ["fdr_maturity", "FDR approaching maturity", "Raised at each configured threshold (30/15/7/0 days) for FDRs that are not closed.", "warning", "finance", "{}", 2],
    ["fdr_matured_no_action", "Matured with no recorded next action", "FDR is past maturity and has no renewal or release request in progress.", "critical", "finance", "{}", 1],
    ["verification_pending", "Document verification pending too long", "Document has waited for review longer than the configured number of days.", "high", "verifier", "{}", 2],
    ["missing_document", "Required document missing", "Active FDR has no uploaded FDR receipt.", "warning", "institution", "{}", 5],
    ["release_overdue", "Release request overdue", "Release request is past its due date and not yet decided or processed.", "high", "finance", "{}", 1],
    ["renewal_doc_rejected", "Renewal document rejected or needs changes", "A renewal FDR document was rejected or sent back for changes.", "high", "institution", "{}", 3],
    ["register_mismatch", "Register and document values differ", "Values typed from the document face (unverified) differ from the FDR register.", "high", "verifier", "{}", 2],
  ];
  for (const r of rules)
    await db.query(
      "insert into alert_rules (key, name, description, severity, assigned_role, params, escalate_after_days) values ($1,$2,$3,$4,$5,$6,$7)",
      [r[0], r[1], r[2], r[3], r[4], r[5], r[6]],
    );

  // ----- institutions
  const instIds: string[] = [];
  for (const [i, [name, cat, state, district, contact]] of INSTITUTIONS.entries()) {
    const slug = name.split(" ")[0].toLowerCase();
    const id = await ins(
      `insert into institutions (name, category, aicte_ref, state, district, contact_name, contact_email, contact_phone, status, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning id`,
      [name, cat, `DEMO-AICTE-${String(i + 101).padStart(4, "0")}`, state, district, contact, `${slug}.demo@example.invalid`,
        `+91 90000 ${String(10000 + i * 137).slice(-5)}`, i === 9 ? "inactive" : "active"],
    );
    instIds.push(id);
  }

  // ----- users (one per role + a couple of institution users)
  const users: Array<[string, string, string, string | null]> = [
    ["admin@demo.depositflow", "Aarav Admin (demo)", "admin", null],
    ["verifier@demo.depositflow", "Veena Verifier (demo)", "verifier", null],
    ["finance@demo.depositflow", "Farhan Finance (demo)", "finance", null],
    ["auditor@demo.depositflow", "Aditi Auditor (demo)", "auditor", null],
    ["institution@demo.depositflow", "Anita Rao (demo)", "institution", instIds[0]],
    ["kaveri@demo.depositflow", "Vikram Nair (demo)", "institution", instIds[1]],
  ];
  const userIds: Record<string, string> = {};
  for (const [email, name, role, inst] of users)
    userIds[role + (inst ? ":" + inst : "")] = await ins(
      "insert into profiles (email, full_name, role, institution_id, is_demo) values ($1,$2,$3,$4,true) returning id",
      [email, name, role, inst],
    );
  const instUser = userIds["institution:" + instIds[0]];
  const verifierId = userIds["verifier"];
  const financeId = userIds["finance"];

  // ----- deposits + FDRs (+ documents)
  let k = 0;
  const fdrByOffset: Record<number, { fdr: string; dep: string; inst: string }> = {};
  const deposits: Array<{ dep: string; fdr: string; inst: string; off: number }> = [];

  for (const [ii, instId] of instIds.entries()) {
    for (let j = 0; j < 2; j++) {
      const off = OFFSETS[k % OFFSETS.length];
      const principal = PRINCIPALS[(k * 3 + ii) % PRINCIPALS.length];
      const bank = BANKS[(k + ii) % BANKS.length];
      const issue = addDaysISO(today, off - 365 - (k % 4) * 30);
      const maturity = addDaysISO(today, off);
      const depDate = addDaysISO(issue, -(k % 5));
      // Variety of verification outcomes
      const vmod = k % 7;
      const verification = vmod === 3 ? "pending" : vmod === 5 ? "changes_requested" : vmod === 6 ? "not_submitted" : "approved";
      const depStatus = verification === "approved" ? (off < 0 ? "matured" : "verified")
        : verification === "pending" ? "under_review" : verification === "changes_requested" ? "action_required" : "draft";
      const type = ["Security Deposit", "Performance Guarantee", "Earnest Money", "Security Deposit"][k % 4];
      const dep = await ins(
        `insert into deposits (institution_id, deposit_type, principal, deposit_date, bank, status, verification_status, notes, is_demo, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) returning id`,
        [instId, type, principal, depDate, bank, depStatus, verification, "Synthetic demonstration record.", ii === 0 ? instUser : null],
      );
      const fdr = await ins(
        `insert into fdr_records (deposit_id, institution_id, fdr_number, bank, principal, issue_date, maturity_date, verification_status,
           lifecycle_status, remarks, is_demo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) returning id`,
        [dep, instId, `DEMO-FDR-${String(710000 + k * 17)}`, bank, principal, issue, maturity, verification,
          off < 0 ? "matured" : "active", "Fictional FDR number for demonstration."],
      );
      deposits.push({ dep, fdr, inst: instId, off });
      if (!(off in fdrByOffset)) fdrByOffset[off] = { fdr, dep, inst: instId };

      // document (skip when not_submitted so the "missing document" rule has something to find)
      if (verification !== "not_submitted") {
        const pdf = makeDemoPdf(["DEMO FDR RECEIPT - SYNTHETIC DATA", `FDR No: DEMO-FDR-${710000 + k * 17}`, `Bank: ${bank}`,
          `Principal: INR ${principal}`, `Maturity: ${maturity}`, "Not a real bank document."]);
        const key = saveFile(pdf, "pdf");
        const dstatus = verification === "approved" ? "approved" : verification === "pending" ? "pending_review" : "changes_requested";
        // Reviewed receipts were uploaded 1-3 days before their review, so turnaround metrics are realistic.
        const uploadedAt = verification === "pending" ? `${addDaysISO(today, -(4 + (k % 3)))}T10:00:00Z` : `${addDaysISO(today, -(3 + (k % 5) + (k % 3)))}T10:00:00Z`;
        const doc = await ins(
          `insert into documents (institution_id, deposit_id, fdr_id, doc_type, title, status, uploaded_by, is_demo, created_at, updated_at)
           values ($1,$2,$3,'fdr_receipt',$4,$5,$6,true,$7,$7) returning id`,
          [instId, dep, fdr, `FDR receipt DEMO-FDR-${710000 + k * 17}`, dstatus, instUser, uploadedAt],
        );
        // one deliberate register/document mismatch to demo the inconsistency rule
        const mismatch = k === 11;
        await db.query(
          `insert into document_versions (document_id, version, storage_key, original_name, mime, size_bytes, sha256,
             declared_fdr_number, declared_amount, declared_maturity, uploaded_by, uploaded_at)
           values ($1,1,$2,$3,'application/pdf',$4,$5,$6,$7,$8,$9,$10)`,
          [doc, key, "fdr-receipt-demo.pdf", pdf.length, sha256(pdf), `DEMO-FDR-${710000 + k * 17}`,
            mismatch ? "3000000.00" : principal, maturity, instUser, uploadedAt],
        );
        if (verification !== "pending") {
          await db.query(
            "insert into verification_reviews (document_id, version, reviewer_id, decision, remarks, mode, reviewed_at) values ($1,1,$2,$3,$4,'manual',$5)",
            [doc, verifierId, verification === "approved" ? "approved" : "changes_requested",
              verification === "approved" ? "Matches bank advice (demo review)." : "Receipt scan is cropped. Please upload the full page.",
              `${addDaysISO(today, -(2 + (k % 5)))}T12:00:00Z`],
          );
        }
      }
      await workflowEvent("deposit", dep, null, depStatus, sys, "Seeded demonstration record", db);
      k++;
    }
  }

  // ----- a few release requests covering each state
  const pick = (n: number) => deposits.filter((d) => d.off > 60)[n];
  const releaseCases: Array<{ d: ReturnType<typeof pick>; status: string; due: number; comment?: string }> = [
    { d: pick(0), status: "submitted", due: -3 },
    { d: pick(1), status: "under_review", due: 4 },
    { d: pick(2), status: "info_requested", due: 2, comment: "Please attach the institution's closure undertaking." },
  ];
  for (const c of releaseCases) {
    if (!c.d) continue;
    const rid = await ins(
      `insert into release_requests (deposit_id, fdr_id, institution_id, requested_by, reason, status, reviewer_id, reviewer_comments, due_date, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning id`,
      [c.d.dep, c.d.fdr, c.d.inst, instUser, "Programme closure; requesting release of the security deposit (demo).", c.status,
        c.status === "submitted" ? null : financeId, c.comment ?? null, addDaysISO(today, c.due)],
    );
    await db.query("update deposits set status='release_requested', release_status='requested' where id=$1", [c.d.dep]);
    await workflowEvent("release", rid, null, c.status, sys, "Seeded demonstration request", db);
  }

  await audit(sys, "seed.completed", "system", null, "Demo data", { institutions: instIds.length, deposits: deposits.length }, db);
}
