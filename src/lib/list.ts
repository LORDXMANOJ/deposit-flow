/** Helpers for server-rendered, URL-driven lists (search, filter, sort, paginate). */

export type SP = Record<string, string | undefined>;

export function pageOf(sp: SP, pageSize = 15) {
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function hrefWith(base: string, sp: SP, patch: SP): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Whitelisted ORDER BY so user input never reaches SQL directly. */
export function orderBy(sp: SP, allowed: Record<string, string>, fallback: string): string {
  const key = sp.sort && allowed[sp.sort] ? allowed[sp.sort] : fallback;
  const dir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : key === fallback ? "" : "asc";
  return `${key} ${dir}`.trim();
}
