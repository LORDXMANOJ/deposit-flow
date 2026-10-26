import type { Permission } from "./rbac";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission; keys: string; group: "Monitor" | "Records" | "Workflow" | "Insight" | "Admin" };

/** Single source for the sidebar, breadcrumbs and command menu. `keys` is the "g then x" shortcut. */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: "LayoutDashboard", keys: "g o", group: "Monitor" },
  { href: "/alerts", label: "Alerts & Notifications", icon: "BellRing", perm: "alert.read", keys: "g a", group: "Monitor" },
  { href: "/calendar", label: "Maturity Calendar", icon: "CalendarDays", perm: "deposit.read", keys: "g c", group: "Monitor" },
  { href: "/institutions", label: "Institutions", icon: "Building2", perm: "institution.read", keys: "g i", group: "Records" },
  { href: "/deposits", label: "Security Deposits", icon: "Landmark", perm: "deposit.read", keys: "g d", group: "Records" },
  { href: "/fdrs", label: "FDR Register", icon: "FileStack", perm: "deposit.read", keys: "g f", group: "Records" },
  { href: "/verification", label: "Document Verification", icon: "ShieldCheck", perm: "document.read", keys: "g v", group: "Workflow" },
  { href: "/releases", label: "Release & Refund", icon: "ArrowRightLeft", perm: "deposit.read", keys: "g q", group: "Workflow" },
  { href: "/reports", label: "Reports & Analytics", icon: "BarChart3", perm: "report.read", keys: "g r", group: "Insight" },
  { href: "/audit", label: "Audit Trail", icon: "ScrollText", perm: "audit.read", keys: "g t", group: "Insight" },
  { href: "/users", label: "User & Role Management", icon: "Users", perm: "user.manage", keys: "g u", group: "Admin" },
  { href: "/settings", label: "Settings", icon: "Settings", perm: "settings.manage", keys: "g s", group: "Admin" },
];
