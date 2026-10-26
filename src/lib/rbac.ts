/**
 * Role-based permission matrix. This is DEMONSTRATION logic, not an AICTE-mandated hierarchy.
 * Every server action calls `can()` / `requirePerm()`; hiding buttons is only a convenience.
 */

export const ROLES = ["admin", "institution", "verifier", "finance", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  institution: "Institution User",
  verifier: "Verification Officer",
  finance: "Finance / Authorized Officer",
  auditor: "Auditor (read-only)",
};

export const PERMISSIONS = [
  "institution.read",
  "institution.write",
  "deposit.read",
  "deposit.write",
  "fdr.write",
  "document.upload",
  "document.read",
  "document.review",
  "release.create",
  "release.review",
  "release.process",
  "renewal.manage",
  "alert.read",
  "alert.manage",
  "alert.run",
  "report.read",
  "report.export",
  "audit.read",
  "user.manage",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = [
  "institution.read",
  "deposit.read",
  "document.read",
  "alert.read",
  "report.read",
];

const MATRIX: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  institution: [
    ...READ,
    "deposit.write",
    "fdr.write",
    "document.upload",
    "release.create",
    "renewal.manage",
  ],
  verifier: [...READ, "document.review", "alert.manage", "alert.run", "report.export"],
  finance: [
    ...READ,
    "release.review",
    "release.process",
    "renewal.manage",
    "alert.manage",
    "alert.run",
    "report.export",
  ],
  auditor: [...READ, "report.export", "audit.read"],
};

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(perm) ?? false;
}

/** Institution users only see records of their own institution. Others see all. */
export function isScoped(role: Role): boolean {
  return role === "institution";
}

export class ForbiddenError extends Error {
  constructor(perm: string) {
    super(`Your role is not permitted to perform this action (${perm}).`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role | undefined | null, perm: Permission): void {
  if (!can(role, perm)) throw new ForbiddenError(perm);
}
