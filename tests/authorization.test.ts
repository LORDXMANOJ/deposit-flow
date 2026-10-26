import { beforeAll, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Authorization boundaries, tested the way an attacker would probe them: by calling the server
 * actions, API route handlers and page loaders directly with real and forged sessions. The UI
 * (role picker, hidden buttons) is not involved anywhere in this file.
 */

const h = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return { jar };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined),
    set: (n: string, v: string) => void h.jar.set(n, v),
    delete: (n: string) => void h.jar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error("REDIRECT:" + url); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "depositflow-authz-"));
process.env.DEPOSITFLOW_DATA_DIR = dir;

let db: typeof import("@/lib/db");
let auth: typeof import("@/lib/auth");
let records: typeof import("@/app/actions/records");
let wf: typeof import("@/app/actions/workflow");
let authActions: typeof import("@/app/actions/auth");
let storage: typeof import("@/lib/storage");
let secret: typeof import("@/lib/secret");

type Ids = Record<string, string>;
const U: Ids = {}; // profile ids by short name
const A: Ids = {}; // records of institution A (Sahyadri, user "inst")
const B: Ids = {}; // records of institution B (Kaveri, user "instB")

async function as(who: string | null) {
  h.jar.clear();
  if (who) await auth.createSession(U[who]);
}
const denied = /not permitted|another institution|signed out|cannot|own request/i;
const counts = () => db.q<Record<string, number>>(
  `select (select count(*)::int from deposits) dep, (select count(*)::int from fdr_records) fdr, (select count(*)::int from documents) doc,
          (select count(*)::int from release_requests) rel, (select count(*)::int from verification_reviews) rev, (select count(*)::int from alerts) alr,
          (select count(*)::int from institutions) inst, (select count(*)::int from profiles) prof,
          (select string_agg(status || verification_status || coalesce(notes,''), ',' order by id) from deposits) depstate,
          (select string_agg(status, ',' order by id) from release_requests) relstate,
          (select string_agg(key || value::text, ',' order by key) from system_settings) settings`).then((r) => r[0]);

beforeAll(async () => {
  db = await import("@/lib/db");
  auth = await import("@/lib/auth");
  records = await import("@/app/actions/records");
  wf = await import("@/app/actions/workflow");
  authActions = await import("@/app/actions/auth");
  storage = await import("@/lib/storage");
  secret = await import("@/lib/secret");
  await db.getDb();
  const { runChecks } = await import("@/lib/alert-engine");
  await runChecks({ id: null, name: "Test setup", role: "system" });
  for (const [k, email] of Object.entries({ admin: "admin@demo.depositflow", verifier: "verifier@demo.depositflow", finance: "finance@demo.depositflow",
    auditor: "auditor@demo.depositflow", inst: "institution@demo.depositflow", instB: "kaveri@demo.depositflow" }))
    U[k] = (await db.one<{ id: string }>("select id from profiles where email=$1", [email]))!.id;
  for (const [bag, user] of [[A, "inst"], [B, "instB"]] as const) {
    const inst = (await db.one<{ institution_id: string }>("select institution_id from profiles where id=$1", [U[user]]))!.institution_id;
    bag.inst = inst;
    const dep = (await db.one<{ id: string; fdr: string }>(
      `select d.id, f.id as fdr from deposits d join fdr_records f on f.deposit_id=d.id
       where d.institution_id=$1 and d.verification_status='approved' and d.status not in ('release_requested','released') limit 1`, [inst]))!;
    bag.dep = dep.id;
    bag.fdr = dep.fdr;
    const doc = await db.one<{ id: string; ver: string }>("select d.id, v.id as ver from documents d join document_versions v on v.document_id=d.id where d.institution_id=$1 limit 1", [inst]);
    bag.doc = doc?.id ?? "";
    bag.ver = doc?.ver ?? "";
  }
});

describe("institution users cannot reach another institution's records", () => {
  test("page loaders return not-found for another institution's deposit, FDR and profile", async () => {
    await as("inst");
    const dep = (await import("@/app/(app)/deposits/[id]/page")).default;
    const fdr = (await import("@/app/(app)/fdrs/[id]/page")).default;
    const inst = (await import("@/app/(app)/institutions/[id]/page")).default;
    await expect(dep({ params: Promise.resolve({ id: B.dep }) })).rejects.toThrow("NOT_FOUND");
    await expect(fdr({ params: Promise.resolve({ id: B.fdr }) })).rejects.toThrow("NOT_FOUND");
    await expect(inst({ params: Promise.resolve({ id: B.inst }) })).rejects.toThrow("NOT_FOUND");
    // and their own records do render
    await expect(dep({ params: Promise.resolve({ id: A.dep }) })).resolves.toBeTruthy();
  });

  test("every write action refuses another institution's records", async () => {
    await as("inst");
    const before = await counts();
    const results = [
      await records.createDeposit({ institution_id: B.inst, deposit_type: "Security Deposit", principal: "100000", deposit_date: "2026-10-01", bank: "Bank" }),
      await records.updateDepositNotes(B.dep, "tampered"),
      await records.setRemarks(B.fdr, "tampered"),
      await records.startRenewal(B.fdr, { fdr_number: "X-1", issue_date: "2026-10-01", maturity_date: "2027-10-01", principal: "1.00" }),
      await wf.createRelease({ deposit_id: B.dep, reason: "Trying to release someone else's deposit" }),
    ];
    const fd = new FormData();
    fd.set("fdr_id", B.fdr);
    fd.set("file", new File([Buffer.from("%PDF-1.4 test")], "x.pdf", { type: "application/pdf" }));
    results.push(await wf.uploadDocument(fd));
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/another institution/);
    }
    expect(await counts()).toEqual(before);
  });

  test("search, exports and file links stay inside the user's institution", async () => {
    await as("inst");
    const bName = (await db.one<{ name: string }>("select name from institutions where id=$1", [B.inst]))!.name;
    const search = (await import("@/app/api/search/route")).GET;
    const hits = (await (await search(new Request(`http://x/api/search?q=${encodeURIComponent(bName.split(" ")[0])}`))).json()).hits as Array<{ sub: string; label: string }>;
    expect(hits.some((x) => x.label === bName || x.sub.includes(bName))).toBe(false);

    const exportGet = (await import("@/app/api/export/[report]/route")).GET;
    expect((await exportGet(new Request("http://x"), { params: Promise.resolve({ report: "deposit_register" }) })).status).toBe(403);

    // Even a validly signed link for this user cannot open another institution's file.
    const files = (await import("@/app/api/files/[versionId]/route")).GET;
    const token = storage.signFileToken(B.ver, U.inst);
    expect((await files(new Request(`http://x/api/files/${B.ver}?token=${token}`), { params: Promise.resolve({ versionId: B.ver }) })).status).toBe(403);
    expect((await files(new Request(`http://x/api/files/${A.ver}`), { params: Promise.resolve({ versionId: A.ver }) })).status).toBe(403); // no token
    const ownToken = storage.signFileToken(A.ver, U.inst);
    expect((await files(new Request(`http://x/api/files/${A.ver}?token=${ownToken}`), { params: Promise.resolve({ versionId: A.ver }) })).status).toBe(200);
  });

  test("the JSON API enforces the same rule", async () => {
    await as("inst");
    const post = (await import("@/app/api/v1/deposits/route")).POST;
    const res = await post(new Request("http://x/api/v1/deposits", { method: "POST", body: JSON.stringify({ institution_id: B.inst, deposit_type: "Security Deposit", principal: "100", deposit_date: "2026-10-01", bank: "Bank of Demo" }) }));
    expect(res.status).toBe(403);
  });
});

describe("nobody can approve their own release, and institution users cannot decide at all", () => {
  test("institution user cannot move their own request forward", async () => {
    await as("inst");
    const r = await wf.createRelease({ deposit_id: A.dep, reason: "Programme closed, please release (authz test)" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const to of ["under_review", "approved", "released"]) {
      const t = await wf.transitionRelease(r.id, to, "self-approval attempt", "SIMULATED");
      expect(t.ok).toBe(false);
    }
    expect((await db.one<{ status: string }>("select status from release_requests where id=$1", [r.id]))!.status).toBe("submitted");
    A.rel = r.id;
  });

  test("an administrator who raised a request cannot approve or record it", async () => {
    await as("admin");
    const r = await wf.createRelease({ deposit_id: B.dep, reason: "Raised by admin to test separation of duties" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await wf.transitionRelease(r.id, "under_review", "")).ok).toBe(true);
    const approve = await wf.transitionRelease(r.id, "approved", "approving my own request");
    expect(approve.ok).toBe(false);
    if (!approve.ok) expect(approve.error).toMatch(/cannot approve or process their own request/);
  });

  test("verifier cannot decide releases and finance cannot review documents", async () => {
    await as("verifier");
    expect((await wf.transitionRelease(A.rel, "under_review", "")).ok).toBe(false);
    await as("finance");
    const docPending = (await db.one<{ id: string }>("select id from documents where status='pending_review' limit 1"))!.id;
    const r = await wf.reviewDocument(docPending, { decision: "approved" });
    expect(r.ok).toBe(false);
    expect((await db.one<{ status: string }>("select status from documents where id=$1", [docPending]))!.status).toBe("pending_review");
  });
});

describe("the read-only auditor cannot change anything", () => {
  test("every write action is refused and no row changes", async () => {
    await as("auditor");
    const before = await counts();
    const docPending = (await db.one<{ id: string }>("select id from documents where status='pending_review' limit 1"))!.id;
    const alert = await db.one<{ id: string }>("select id from alerts limit 1");
    const fd = new FormData();
    fd.set("fdr_id", A.fdr);
    fd.set("file", new File([Buffer.from("%PDF-1.4 x")], "x.pdf"));
    const attempts = await Promise.all([
      records.createDeposit({ institution_id: A.inst, deposit_type: "Security Deposit", principal: "100", deposit_date: "2026-10-01", bank: "B" }),
      records.updateDepositNotes(A.dep, "auditor edit"),
      records.saveInstitution(A.inst, { name: "Renamed by auditor", category: "Engineering", state: "X", district: "Y", contact_name: "Z Z", contact_email: "a@b.co", contact_phone: "+91 90000 00000", status: "active" }),
      records.setInstitutionStatus(A.inst, "inactive"),
      records.deleteInstitution(A.inst),
      records.startRenewal(A.fdr, { fdr_number: "AUD-1", issue_date: "2026-10-01", maturity_date: "2027-10-01", principal: "1.00" }),
      records.setRemarks(A.fdr, "auditor edit"),
      wf.uploadDocument(fd),
      wf.reviewDocument(docPending, { decision: "approved" }),
      wf.createRelease({ deposit_id: A.dep, reason: "auditor trying to release" }),
      wf.transitionRelease(A.rel, "under_review", "auditor"),
      wf.runChecksNow(),
      alert ? wf.setAlertStatus(alert.id, "resolved") : Promise.resolve({ ok: false as const, error: "no alert" }),
      wf.saveSettings({ thresholds: "1", max_file_mb: 25, verification_pending_days: 1, release_sla_days: 1 }),
      wf.toggleRule("fdr_maturity", false, 0),
      wf.updateUser(U.auditor, "admin", null, true),
      wf.createUser({ email: "evil@x.co", full_name: "Evil Admin", role: "admin", institution_id: null }),
      wf.resetDemoData(),
    ]);
    for (const r of attempts) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(denied);
    }
    expect(await counts()).toEqual(before);
  });
});

describe("sessions cannot be forged or escalated", () => {
  const COOKIE = "df_session";
  const sign = (payload: string, key: string) => crypto.createHmac("sha256", key).update(payload).digest("base64url");
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

  test("editing the user id inside a valid cookie invalidates it", async () => {
    await as("inst");
    const [payload, sig] = h.jar.get(COOKIE)!.split(".");
    const forged = enc({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), uid: U.admin });
    h.jar.set(COOKIE, `${forged}.${sig}`);
    expect(await auth.getUser()).toBeNull();
    expect((await wf.updateUser(U.inst, "admin", null, true)).ok).toBe(false);
  });

  test("a cookie signed with a guessed or old hard-coded key is rejected", async () => {
    const p = enc({ uid: U.admin, exp: Math.floor(Date.now() / 1000) + 3600 });
    for (const key of ["depositflow-demo-only-secret-change-me", "secret", ""]) {
      h.jar.set(COOKIE, `${p}.${sign(p, key)}`);
      expect(await auth.getUser()).toBeNull();
    }
  });

  test("expired sessions and deactivated users are rejected", async () => {
    const p = enc({ uid: U.admin, exp: Math.floor(Date.now() / 1000) - 5 });
    h.jar.set(COOKIE, `${p}.${sign(p, secret.signingSecret())}`);
    expect(await auth.getUser()).toBeNull();

    await as("verifier");
    expect((await auth.getUser())?.role).toBe("verifier");
    await db.q("update profiles set active=false where id=$1", [U.verifier]);
    expect(await auth.getUser()).toBeNull();
    await db.q("update profiles set active=true where id=$1", [U.verifier]);
  });

  test("the role always comes from the database, never from the client", async () => {
    await as("inst");
    expect((await auth.getUser())?.role).toBe("institution");
    // An institution user cannot promote themselves; only an administrator can change roles.
    expect((await wf.updateUser(U.inst, "admin", null, true)).ok).toBe(false);
    expect((await db.one<{ role: string }>("select role from profiles where id=$1", [U.inst]))!.role).toBe("institution");
  });

  test("signed-out requests are refused", async () => {
    await as(null);
    expect((await records.createDeposit({})).ok).toBe(false);
    const exportGet = (await import("@/app/api/export/[report]/route")).GET;
    expect((await exportGet(new Request("http://x"), { params: Promise.resolve({ report: "deposit_register" }) })).status).toBe(401);
    const notif = (await import("@/app/api/notifications/route")).GET;
    expect((await notif()).status).toBe(401);
  });

  test("the demo role picker only accepts active demo profiles and can be switched off", async () => {
    const fd = new FormData();
    fd.set("user_id", crypto.randomUUID());
    await expect(authActions.signInAsDemo(fd)).rejects.toThrow("REDIRECT:/login?error=1");
    process.env.DEMO_ROLE_PICKER = "off";
    fd.set("user_id", U.admin);
    await expect(authActions.signInAsDemo(fd)).rejects.toThrow("REDIRECT:/login?error=disabled");
    delete process.env.DEMO_ROLE_PICKER;
  });

  test("production refuses to start without a real signing secret", async () => {
    vi.resetModules();
    const env = process.env as Record<string, string | undefined>;
    const prev = { node: env.NODE_ENV, secret: env.SESSION_SECRET };
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    const fresh = await import("@/lib/secret");
    expect(() => fresh.signingSecret()).toThrow(/SESSION_SECRET must be set/);
    env.NODE_ENV = prev.node;
    if (prev.secret) env.SESSION_SECRET = prev.secret;
  });
});
