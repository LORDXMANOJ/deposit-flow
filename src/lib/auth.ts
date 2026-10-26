import "server-only";
import { signingSecret } from "./secret";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "./db";
import { assertCan, can, isScoped, type Permission, type Role } from "./rbac";
import type { Actor } from "./audit";

/**
 * DEMO AUTHENTICATION. A signed, expiring cookie identifies a seeded demo profile; there are
 * no passwords. This is NOT production-grade. In a Supabase deployment this module is replaced
 * by Supabase Auth (see README) and the same `getUser()` contract is kept.
 */

const COOKIE = "df_session";
const TTL_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  institutionId: string | null;
};


function sign(payload: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export async function createSession(userId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let parsed: { uid: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!parsed.uid || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  const row = await one<{ id: string; email: string; full_name: string; role: Role; institution_id: string | null; active: boolean }>(
    "select id, email, full_name, role, institution_id, active from profiles where id = $1",
    [parsed.uid],
  );
  if (!row || !row.active) return null;
  return { id: row.id, email: row.email, name: row.full_name, role: row.role, institutionId: row.institution_id };
}

/** For pages: redirect to login when signed out, to the dashboard when the role lacks the permission. */
export async function requireUser(perm?: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (perm && !can(user.role, perm)) redirect("/?denied=1");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function authorize(perm: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new Error("You are signed out. Please sign in again.");
  assertCan(user.role, perm);
  return user;
}

export function toActor(u: SessionUser): Actor {
  return { id: u.id, name: u.name, role: u.role };
}

/** SQL fragment + params restricting rows to the user's institution when the role is scoped. */
export function scopeClause(u: SessionUser, column: string, startIndex: number): { sql: string; params: unknown[] } {
  if (!isScoped(u.role)) return { sql: "", params: [] };
  return { sql: ` and ${column} = $${startIndex}`, params: [u.institutionId] };
}

/** Throws unless the user may touch a record belonging to `institutionId`. */
export function assertInstitutionAccess(u: SessionUser, institutionId: string): void {
  if (isScoped(u.role) && u.institutionId !== institutionId) {
    throw new Error("This record belongs to another institution.");
  }
}
